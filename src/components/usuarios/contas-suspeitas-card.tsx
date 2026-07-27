import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listarContasPrimeiroAcessoSuspeitas } from "@/lib/usuarios.functions";

const MOTIVO_LABEL: Record<string, string> = {
  nunca_logou: "Nunca acessou",
  primeiro_acesso_ja_marcado_concluido: "Primeiro acesso marcado como concluído",
  sem_evidencia_de_troca_de_senha: "Sem evidência de troca de senha",
  criado_no_periodo_da_regra_antiga: "Criado na regra antiga",
};

/**
 * ETAPA 1 — Revisão somente leitura de contas antigas potencialmente
 * inconsistentes. Não altera nenhuma conta: apenas indica quem deve ser
 * revisado manualmente pelo Super Admin.
 */
export function ContasSuspeitasCard({
  onRedefinir,
}: {
  onRedefinir?: (u: { id: string; nome: string; email: string }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const fn = useServerFn(listarContasPrimeiroAcessoSuspeitas);
  const q = useQuery({
    queryKey: ["usuarios", "contas-primeiro-acesso-suspeitas"],
    queryFn: () => fn({ data: {} }),
    staleTime: 60_000,
    retry: false,
  });

  const total = q.data?.length ?? 0;
  if (q.isError) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Revisão de primeiro acesso</p>
          <p className="text-xs text-muted-foreground">
            {q.isLoading
              ? "Analisando contas antigas…"
              : total === 0
                ? "Nenhuma conta em estado inconsistente."
                : `${total} conta(s) ativa(s) nunca acessaram o sistema e estão sem evidência de troca de senha.`}
          </p>
        </div>
        {q.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Badge variant="outline" className="shrink-0 font-mono">
            {total}
          </Badge>
        )}
        {aberto ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {aberto && (
        <div className="space-y-2 border-t border-amber-500/30 p-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Consulta somente leitura — nenhuma conta é alterada automaticamente.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {total === 0 && !q.isLoading && (
            <p className="text-sm text-muted-foreground">Tudo certo por aqui.</p>
          )}

          <ul className="space-y-2">
            {(q.data ?? []).map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.nome ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email ?? "—"}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(c.motivos ?? []).map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px] font-normal">
                        {MOTIVO_LABEL[m] ?? m}
                      </Badge>
                    ))}
                  </div>
                </div>
                {onRedefinir && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      onRedefinir({ id: c.id, nome: c.nome ?? "—", email: c.email ?? "—" })
                    }
                  >
                    Redefinir senha padrão
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
