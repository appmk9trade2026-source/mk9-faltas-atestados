// ============================================================
// UPLOAD RESILIENTE — MOBILE / STORAGE
// ============================================================

const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_TIMEOUT_MS = 45_000;
const UPLOAD_RETRY_DELAYS = [800, 1_500] as const;

class UploadNetworkError extends Error {
  readonly code = "UPLOAD_NETWORK_ERROR";
  readonly correlationId: string;

  constructor(correlationId: string) {
    super("Não foi possível enviar o documento.");
    this.name = "UploadNetworkError";
    this.correlationId = correlationId;
  }
}

class UploadOfflineError extends Error {
  readonly code = "UPLOAD_OFFLINE";
  readonly correlationId: string;

  constructor(correlationId: string) {
    super("Sem conexão com a internet.");
    this.name = "UploadOfflineError";
    this.correlationId = correlationId;
  }
}

class UploadTimeoutError extends Error {
  readonly code = "UPLOAD_TIMEOUT";
  readonly correlationId: string;

  constructor(correlationId: string) {
    super("O envio do documento demorou mais que o esperado.");
    this.name = "UploadTimeoutError";
    this.correlationId = correlationId;
  }
}

type UploadedAttachment = {
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
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
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
  };

  const raw = candidate.status ?? candidate.statusCode;

  if (typeof raw === "number") return raw;

  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isTransientUploadError(error: unknown) {
  const message = getUploadErrorMessage(error).toLowerCase();
  const status = getUploadStatus(error);

  // Não repetir erros permanentes.
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 413 ||
    status === 415 ||
    status === 422
  ) {
    return false;
  }

  // Erros de servidor podem ser transitórios.
  if (status !== null && status >= 500) {
    return true;
  }

  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("networkerror") ||
    message.includes("connection") ||
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
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new UploadTimeoutError(correlationId));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function uploadAtestadoResiliente(params: {
  file: File;
  path: string;
  correlationId: string;
  onRetry?: (attempt: number) => void;
}): Promise<UploadedAttachment> {
  const { file, path, correlationId, onRetry } = params;

  if (
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  ) {
    throw new UploadOfflineError(correlationId);
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      throw new UploadOfflineError(correlationId);
    }

    try {
      console.info("[UPLOAD]", {
        correlation_id: correlationId,
        attempt,
        path,
        file_size: file.size,
        file_type: file.type,
      });

      const result = await withTimeout(
        supabase.storage
          .from(BUCKET_ATESTADOS)
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          }),
        UPLOAD_TIMEOUT_MS,
        correlationId,
      );

      if (!result.error) {
        return {
          path,
          nome: file.name,
          mime: file.type,
          tamanho: file.size,
        };
      }

      lastError = result.error;

      // 409 pode significar que a primeira tentativa chegou ao Storage
      // mas a resposta se perdeu. Verificamos o objeto antes de falhar.
      if (getUploadStatus(result.error) === 409) {
        const directory = path.split("/").slice(0, -1).join("/");
        const filename = path.split("/").pop();

        if (filename) {
          const { data: existing } = await supabase.storage
            .from(BUCKET_ATESTADOS)
            .list(directory, {
              search: filename,
              limit: 5,
            });

          if (existing?.some((item) => item.name === filename)) {
            return {
              path,
              nome: file.name,
              mime: file.type,
              tamanho: file.size,
            };
          }
        }
      }

      if (!isTransientUploadError(result.error)) {
        throw result.error;
      }
    } catch (error) {
      lastError = error;

      if (
        error instanceof UploadOfflineError ||
        !isTransientUploadError(error)
      ) {
        throw error;
      }
    }

    if (attempt >= UPLOAD_MAX_ATTEMPTS) break;

    onRetry?.(attempt);

    await wait(
      UPLOAD_RETRY_DELAYS[
        Math.min(attempt - 1, UPLOAD_RETRY_DELAYS.length - 1)
      ],
    );
  }

  if (lastError instanceof UploadTimeoutError) {
    throw lastError;
  }

  console.error("[UPLOAD] Falha após retries", {
    correlation_id: correlationId,
    path,
    message: getUploadErrorMessage(lastError),
  });

  throw new UploadNetworkError(correlationId);
}

async function removerUploadSeExistir(
  path: string | null | undefined,
  correlationId: string,
) {
  if (!path) return;

  try {
    const { error } = await supabase.storage
      .from(BUCKET_ATESTADOS)
      .remove([path]);

    if (error) {
      console.error("[UPLOAD-CLEANUP]", {
        correlation_id: correlationId,
        path,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("[UPLOAD-CLEANUP]", {
      correlation_id: correlationId,
      path,
      message: getUploadErrorMessage(error),
    });
  }
}

function getUploadSafeCode(error: unknown): string | null {
  if (error instanceof UploadOfflineError) return "UPLOAD_OFFLINE";
  if (error instanceof UploadTimeoutError) return "UPLOAD_TIMEOUT";
  if (error instanceof UploadNetworkError) return "UPLOAD_NETWORK_ERROR";

  const message = getUploadErrorMessage(error).toLowerCase();

  if (
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "UPLOAD_NETWORK_ERROR";
  }

  return null;
}
