// Componentes de UX para busca assistida (auto-pesquisa com debounce).
// Puramente apresentacionais: não alteram consultas, regras de negócio ou permissões.
import { useCallback, useEffect, useState } from "react";
import { Check, Info, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Coach mark (primeira utilização)                                            */
/* -------------------------------------------------------------------------- */

export function useCoachMark(storageKey: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) !== "1") setVisible(true);
    } catch {
      /* storage indisponível — não exibe */
    }
  }, [storageKey]);

  const dismiss = useCallback(() => setVisible(false), []);
  const neverShowAgain = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, [storageKey]);

  return { visible, dismiss, neverShowAgain };
}

export function CoachMark({
  text,
  onDismiss,
  onNeverShowAgain,
}: {
  text: string;
  onDismiss: () => void;
  onNeverShowAgain: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-label="Dica de utilização"
      className="relative mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 shadow-sm"
    >
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 left-8 h-3 w-3 rotate-45 border-b border-r border-primary/30 bg-primary/5"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 flex-none text-primary" />
          <p className="text-sm">{text}</p>
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onDismiss} autoFocus>
            Entendi
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onNeverShowAgain}>
            Não mostrar novamente
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback visual                                                             */
/* -------------------------------------------------------------------------- */

export type BuscaEstado = "idle" | "carregando" | "atualizado";

export function BuscaStatus({ estado, className }: { estado: BuscaEstado; className?: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className={cn("min-h-5 text-xs", className)}>
      {estado === "carregando" && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando informações...
        </span>
      )}
      {estado === "atualizado" && (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          Dados atualizados
        </span>
      )}
    </div>
  );
}

export function BuscaSkeleton({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chips de filtros ativos                                                     */
/* -------------------------------------------------------------------------- */

export type FiltroChip = {
  id: string;
  titulo: string;
  valor: string;
  onRemove?: () => void;
};

export function FiltroChips({ chips, className }: { chips: FiltroChip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} aria-label="Filtros ativos">
      {chips.map((c) => (
        <Badge key={c.id} variant="secondary" className="gap-1 py-1 pl-2 pr-1 font-normal">
          <span className="text-muted-foreground">{c.titulo}:</span>
          <span className="max-w-40 truncate">{c.valor}</span>
          {c.onRemove && (
            <button
              type="button"
              onClick={c.onRemove}
              aria-label={`Remover filtro ${c.titulo}`}
              className="ml-0.5 rounded-full p-0.5 transition hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Estado vazio inteligente                                                    */
/* -------------------------------------------------------------------------- */

export function EstadoVazioBusca({
  mensagem,
  acaoLabel,
  onAcao,
}: {
  mensagem: string;
  acaoLabel: string;
  onAcao: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">{mensagem}</p>
      <Button type="button" size="sm" variant="outline" onClick={onAcao}>
        {acaoLabel}
      </Button>
    </div>
  );
}
