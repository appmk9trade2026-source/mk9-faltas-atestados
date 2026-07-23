import { useCallback, useEffect, useRef } from "react";

/**
 * Rascunho automático (Auto Save) genérico para formulários.
 * Persiste em localStorage com debounce, isolado por chave (usuário + form).
 * Não bloqueia a UI e trata erros de storage silenciosamente (quota, modo privado).
 */

export type DraftEnvelope<T> = {
  data: T;
  savedAt: number;
  version: number;
};

const DRAFT_VERSION = 1;

function safeGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    /* quota / privacy mode — ignorar */
  }
}
function safeRemove(key: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useFormDraft<T>(
  key: string | null,
  options: { debounceMs?: number; enabled?: boolean } = {},
) {
  const { debounceMs = 500, enabled = true } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);

  const load = useCallback((): DraftEnvelope<T> | null => {
    if (!key || !enabled) return null;
    const raw = safeGet(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as DraftEnvelope<T>;
      if (!parsed || parsed.version !== DRAFT_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [key, enabled]);

  const save = useCallback(
    (data: T) => {
      if (!key || !enabled) return;
      const envelope: DraftEnvelope<T> = {
        data,
        savedAt: Date.now(),
        version: DRAFT_VERSION,
      };
      safeSet(key, JSON.stringify(envelope));
      pendingRef.current = null;
    },
    [key, enabled],
  );

  const clear = useCallback(() => {
    if (!key) return;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    safeRemove(key);
  }, [key]);

  const scheduleSave = useCallback(
    (data: T) => {
      if (!key || !enabled) return;
      pendingRef.current = data;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pendingRef.current != null) save(pendingRef.current);
        timerRef.current = null;
      }, debounceMs);
    },
    [save, debounceMs, key, enabled],
  );

  /** Grava imediatamente qualquer alteração pendente. */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current != null) save(pendingRef.current);
  }, [save]);

  // Persistir quando a aba/app perde foco (mobile background, lock screen, close).
  useEffect(() => {
    if (!enabled || !key) return;
    const onHide = () => flush();
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush, enabled, key]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { load, save, clear, scheduleSave, flush };
}
