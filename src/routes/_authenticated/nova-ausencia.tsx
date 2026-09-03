// ============================================================
// UPLOAD RESILIENTE — MOBILE / STORAGE
// ============================================================

const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_TIMEOUT_MS = 45_000;
const UPLOAD_RETRY_DELAYS = [800, 1_500] as const;

type UploadSafeCode =
  | "UPLOAD_OFFLINE"
  | "UPLOAD_TIMEOUT"
  | "UPLOAD_NETWORK_ERROR";

type UploadedAttachment = {
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
};

class UploadNetworkError extends Error {
  readonly code: UploadSafeCode = "UPLOAD_NETWORK_ERROR";
  readonly correlationId: string;

  constructor(correlationId: string) {
    super("Não foi possível enviar o documento.");
    this.name = "UploadNetworkError";
    this.correlationId = correlationId;
  }
}

class UploadOfflineError extends Error {
  readonly code: UploadSafeCode = "UPLOAD_OFFLINE";
  readonly correlationId: string;

  constructor(correlationId: string) {
    super("Sem conexão com a internet.");
    this.name = "UploadOfflineError";
    this.correlationId = correlationId;
  }
}

class UploadTimeoutError extends Error {
  readonly code: UploadSafeCode = "UPLOAD_TIMEOUT";
  readonly correlationId: string;

  constructor(correlationId: string) {
    super("O envio do documento demorou mais que o esperado.");
    this.name = "UploadTimeoutError";
    this.correlationId = correlationId;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return String(error ?? "");
}

function getUploadStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
  };

  const raw =
    candidate.status ??
    candidate.statusCode;

  if (typeof raw === "number") {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number(raw);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function isBrowserOffline(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  );
}

/**
 * Define se o erro pode ser repetido automaticamente.
 *
 * IMPORTANTE:
 * - timeout é transitório;
 * - falha de rede é transitória;
 * - 408 / 429 / 5xx são transitórios;
 * - 4xx permanentes não recebem retry.
 */
function isTransientUploadError(
  error: unknown,
): boolean {
  if (error instanceof UploadTimeoutError) {
    return true;
  }

  if (error instanceof UploadOfflineError) {
    return false;
  }

  const message =
    getUploadErrorMessage(error).toLowerCase();

  const status =
    getUploadStatus(error);

  if (
    status === 408 ||
    status === 429
  ) {
    return true;
  }

  if (
    status !== null &&
    status >= 500
  ) {
    return true;
  }

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 413 ||
    status === 415 ||
    status === 422
  ) {
    return false;
  }

  return (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("connection") ||
    message.includes("connection reset") ||
    message.includes("socket") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("load failed")
  );
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  correlationId: string,
): Promise<T> {
  let timeout:
    | ReturnType<typeof setTimeout>
    | undefined;

  const timeoutPromise =
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new UploadTimeoutError(
            correlationId,
          ),
        );
      }, timeoutMs);
    });

  try {
    return await Promise.race([
      operation,
      timeoutPromise,
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/**
 * Verifica se o objeto já existe.
 *
 * Útil no cenário:
 *
 * upload chegou ao Storage
 * → resposta se perdeu
 * → retry recebe 409
 *
 * Nesse caso não devemos interpretar como falha se o objeto já existe.
 */
async function storageObjectExists(
  path: string,
): Promise<boolean> {
  try {
    const parts =
      path.split("/");

    const filename =
      parts.pop();

    if (!filename) {
      return false;
    }

    const directory =
      parts.join("/");

    const {
      data,
      error,
    } =
      await supabase.storage
        .from(BUCKET_ATESTADOS)
        .list(directory, {
          search: filename,
          limit: 10,
        });

    if (error) {
      console.warn(
        "[UPLOAD] Não foi possível verificar existência do objeto",
        {
          path,
          message: error.message,
        },
      );

      return false;
    }

    return Boolean(
      data?.some(
        (item) =>
          item.name === filename,
      ),
    );
  } catch (error) {
    console.warn(
      "[UPLOAD] Falha ao consultar objeto existente",
      {
        path,
        message:
          getUploadErrorMessage(
            error,
          ),
      },
    );

    return false;
  }
}

async function uploadAtestadoResiliente(
  params: {
    file: File;
    path: string;
    correlationId: string;
    onRetry?: (
      nextAttempt: number,
      maxAttempts: number,
    ) => void;
  },
): Promise<UploadedAttachment> {
  const {
    file,
    path,
    correlationId,
    onRetry,
  } = params;

  if (isBrowserOffline()) {
    throw new UploadOfflineError(
      correlationId,
    );
  }

  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= UPLOAD_MAX_ATTEMPTS;
    attempt++
  ) {
    if (isBrowserOffline()) {
      throw new UploadOfflineError(
        correlationId,
      );
    }

    try {
      console.info(
        "[UPLOAD] Tentativa iniciada",
        {
          correlation_id:
            correlationId,
          attempt,
          max_attempts:
            UPLOAD_MAX_ATTEMPTS,
          path,
          file_size:
            file.size,
          file_type:
            file.type,
        },
      );

      const result =
        await withTimeout(
          supabase.storage
            .from(BUCKET_ATESTADOS)
            .upload(
              path,
              file,
              {
                contentType:
                  file.type ||
                  "application/octet-stream",

                // Mesmo path é reutilizado.
                // Não usar upsert indiscriminadamente.
                upsert: false,
              },
            ),

          UPLOAD_TIMEOUT_MS,
          correlationId,
        );

      if (!result.error) {
        console.info(
          "[UPLOAD] Concluído",
          {
            correlation_id:
              correlationId,
            attempt,
            path,
          },
        );

        return {
          path,
          nome:
            file.name,
          mime:
            file.type ||
            "application/octet-stream",
          tamanho:
            file.size,
        };
      }

      lastError =
        result.error;

      const status =
        getUploadStatus(
          result.error,
        );

      /**
       * 409:
       *
       * pode significar que uma tentativa anterior efetivamente
       * criou o objeto, mas a resposta ao browser se perdeu.
       */
      if (status === 409) {
        const exists =
          await storageObjectExists(
            path,
          );

        if (exists) {
          console.info(
            "[UPLOAD] Objeto já existe após retry; tratando como sucesso",
            {
              correlation_id:
                correlationId,
              path,
            },
          );

          return {
            path,
            nome:
              file.name,
            mime:
              file.type ||
              "application/octet-stream",
            tamanho:
              file.size,
          };
        }

        // 409 sem objeto comprovado:
        // não repetir automaticamente.
        throw result.error;
      }

      if (
        !isTransientUploadError(
          result.error,
        )
      ) {
        throw result.error;
      }
    } catch (error) {
      lastError =
        error;

      if (
        error instanceof
        UploadOfflineError
      ) {
        throw error;
      }

      if (
        !isTransientUploadError(
          error,
        )
      ) {
        throw error;
      }

      console.warn(
        "[UPLOAD] Falha transitória",
        {
          correlation_id:
            correlationId,
          attempt,
          path,
          message:
            getUploadErrorMessage(
              error,
            ),
        },
      );
    }

    if (
      attempt >=
      UPLOAD_MAX_ATTEMPTS
    ) {
      break;
    }

    const nextAttempt =
      attempt + 1;

    onRetry?.(
      nextAttempt,
      UPLOAD_MAX_ATTEMPTS,
    );

    const delay =
      UPLOAD_RETRY_DELAYS[
        Math.min(
          attempt - 1,
          UPLOAD_RETRY_DELAYS.length -
            1,
        )
      ];

    await wait(delay);
  }

  console.error(
    "[UPLOAD] Falha definitiva",
    {
      correlation_id:
        correlationId,
      path,
      attempts:
        UPLOAD_MAX_ATTEMPTS,
      message:
        getUploadErrorMessage(
          lastError,
        ),
    },
  );

  if (
    lastError instanceof
    UploadOfflineError
  ) {
    throw lastError;
  }

  if (
    lastError instanceof
    UploadTimeoutError
  ) {
    throw lastError;
  }

  throw new UploadNetworkError(
    correlationId,
  );
}

/**
 * Remove objeto que foi enviado ao Storage mas ficou sem
 * registro correspondente no banco.
 */
async function removerUploadSeExistir(
  path:
    | string
    | null
    | undefined,
  correlationId: string,
): Promise<void> {
  if (!path) {
    return;
  }

  try {
    const {
      error,
    } =
      await supabase.storage
        .from(BUCKET_ATESTADOS)
        .remove([path]);

    if (error) {
      console.error(
        "[UPLOAD-CLEANUP] Storage recusou remoção",
        {
          correlation_id:
            correlationId,
          path,
          message:
            error.message,
        },
      );

      return;
    }

    console.info(
      "[UPLOAD-CLEANUP] Objeto removido",
      {
        correlation_id:
          correlationId,
        path,
      },
    );
  } catch (error) {
    console.error(
      "[UPLOAD-CLEANUP] Exceção",
      {
        correlation_id:
          correlationId,
        path,
        message:
          getUploadErrorMessage(
            error,
          ),
      },
    );
  }
}

function getUploadSafeCode(
  error: unknown,
): UploadSafeCode | null {
  if (
    error instanceof
    UploadOfflineError
  ) {
    return "UPLOAD_OFFLINE";
  }

  if (
    error instanceof
    UploadTimeoutError
  ) {
    return "UPLOAD_TIMEOUT";
  }

  if (
    error instanceof
    UploadNetworkError
  ) {
    return "UPLOAD_NETWORK_ERROR";
  }

  const message =
    getUploadErrorMessage(
      error,
    ).toLowerCase();

  if (
    message.includes(
      "failed to fetch",
    ) ||
    message.includes(
      "fetch failed",
    ) ||
    message.includes(
      "network",
    ) ||
    message.includes(
      "load failed",
    )
  ) {
    return "UPLOAD_NETWORK_ERROR";
  }

  return null;
}

function getUploadFriendlyMessage(
  code: UploadSafeCode,
): {
  title: string;
  description: string;
} {
  switch (code) {
    case "UPLOAD_OFFLINE":
      return {
        title:
          "Sem conexão com a internet.",
        description:
          "Conecte-se ao Wi-Fi ou aos dados móveis e tente novamente.",
      };

    case "UPLOAD_TIMEOUT":
      return {
        title:
          "O envio demorou mais que o esperado.",
        description:
          "Sua conexão pode estar instável. Verifique a rede e tente novamente.",
      };

    case "UPLOAD_NETWORK_ERROR":
    default:
      return {
        title:
          "Não foi possível enviar o documento.",
        description:
          "Verifique sua conexão com a internet e tente novamente.",
      };
  }
}
