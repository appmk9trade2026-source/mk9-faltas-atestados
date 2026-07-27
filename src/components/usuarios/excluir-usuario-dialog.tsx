import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  contarDependenciasUsuario,
  excluirUsuarioSeguro,
  type DependenciasUsuario,
} from "@/lib/usuarios.functions";

type Alvo = {
  id: string;
  nome: string;
  email: string;
  roles: string[];
  empresa_nomes: string[];
  projeto_nomes: string[];
};

const LABELS: Record<keyof Omit<DependenciasUsuario, "total_bloqueante">, string> = {
  ausencias_registradas: "Faltas/atestados registrados",
  comunicacoes: "Comunicações criadas ou aprovadas",
  homologacoes: "Homologações aprovadas",
  importacoes: "Importações executadas",
  alertas_eventos: "Alertas atendidos",
  operacao_alertas: "Alertas operacionais criados",
  operacao_incidentes: "Incidentes sob responsabilidade",
  auditorias: "Ações registradas em auditoria",
  access_reviews: "Access reviews",
  bi_visoes_salvas: "Visões salvas de BI",
  notificacao_eventos: "Notificações emitidas",
  login_events: "Logins realizados",
  supervisores_vinculados: "Supervisores vinculados (Coordenador)",
  colaboradores_supervisionados: "Colaboradores diretamente supervisionados",
  vinculos_empresas: "Vínculos com empresas",
  vinculos_projetos: "Vínculos com projetos",
  roles: "Papéis atribuídos",
};


// Chaves informativas (não bloqueiam exclusão — histórico é preservado).
const INFO_KEYS: (keyof DependenciasUsuario)[] = [
  "vinculos_empresas",
  "vinculos_projetos",
  "roles",
  "auditorias",
  "login_events",
  "notificacao_eventos",
  "alertas_eventos",
  "bi_visoes_salvas",
];


export function ExcluirUsuarioDialog({
  alvo,
  onClose,
}: {
  alvo: Alvo | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const contarFn = useServerFn(contarDependenciasUsuario);
  const excluirFn = useServerFn(excluirUsuarioSeguro);

  const [confirmacao, setConfirmacao] = useState("");

  const depsQ = useQuery({
    queryKey: ["usuario-dependencias", alvo?.id],
    enabled: !!alvo,
    queryFn: async () => {
      if (!alvo) throw new Error("Sem alvo");
      return contarFn({ data: { id: alvo.id } });
    },
  });

  const excluirMut = useMutation({
    mutationFn: async () => {
      if (!alvo) throw new Error("Sem alvo");
      return excluirFn({ data: { id: alvo.id, confirmacao: "EXCLUIR" } });
    },
    onSuccess: () => {
      toast.success("Usuário excluído.");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close() {
    setConfirmacao("");
    onClose();
  }

  const deps = depsQ.data;
  const bloqueado = (deps?.total_bloqueante ?? 0) > 0;
  const podeExcluir =
    !!alvo && !depsQ.isLoading && !bloqueado && confirmacao.trim().toUpperCase() === "EXCLUIR";

  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" /> Excluir usuário
          </DialogTitle>
          <DialogDescription>
            Ação irreversível. Recomendamos <strong>Desativar</strong> para preservar históricos.
          </DialogDescription>
        </DialogHeader>

        {alvo && (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm space-y-1">
              <div className="font-medium">{alvo.nome}</div>
              <div className="text-xs text-muted-foreground">{alvo.email}</div>
              <div className="flex flex-wrap gap-1 pt-1">
                {alvo.roles.length === 0 && (
                  <Badge variant="outline" className="text-[10px]">sem papel</Badge>
                )}
                {alvo.roles.map((r) => (
                  <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                ))}
              </div>
              {alvo.empresa_nomes.length > 0 && (
                <div className="text-[11px] text-muted-foreground pt-1">
                  <span className="font-medium">Empresas:</span> {alvo.empresa_nomes.join(", ")}
                </div>
              )}
              {alvo.projeto_nomes.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-medium">Projetos:</span> {alvo.projeto_nomes.slice(0, 6).join(", ")}
                  {alvo.projeto_nomes.length > 6 ? ` +${alvo.projeto_nomes.length - 6}` : ""}
                </div>
              )}
            </div>

            {depsQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando dependências...
              </div>
            )}

            {depsQ.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  Não foi possível verificar dependências: {(depsQ.error as Error).message}
                </AlertDescription>
              </Alert>
            )}

            {deps && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-border/60 p-3 text-xs">
                  {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => {
                    const n = Number(deps[k] ?? 0);
                    const isInfo = INFO_KEYS.includes(k);
                    const highlight = !isInfo && n > 0;
                    return (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className={highlight ? "text-destructive" : "text-muted-foreground"}>
                          {LABELS[k]}
                        </span>
                        <span className={highlight ? "font-semibold text-destructive" : "font-medium"}>
                          {n}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {bloqueado ? (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Exclusão bloqueada por dependências</AlertTitle>
                    <AlertDescription className="text-xs space-y-1">
                      {deps.supervisores_vinculados > 0 && (
                        <div>
                          Este Coordenador possui <strong>{deps.supervisores_vinculados}</strong>{" "}
                          Supervisor(es) vinculado(s). Transfira ou remova esses vínculos em{" "}
                          <strong>Administração › Coordenação</strong> antes de excluir.
                        </div>
                      )}
                      {deps.colaboradores_supervisionados > 0 && (
                        <div>
                          Este usuário supervisiona diretamente{" "}
                          <strong>{deps.colaboradores_supervisionados}</strong> colaborador(es).
                          Reatribua-os a outro Supervisor antes de excluir.
                        </div>
                      )}
                      <div>
                        Total de {deps.total_bloqueante} registro(s) bloqueante(s). Para
                        preservar históricos, prefira <strong>Desativar</strong> no menu.
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Confirmação reforçada</AlertTitle>
                    <AlertDescription className="text-xs">
                      Nenhum histórico operacional encontrado. A exclusão removerá a identidade de
                      autenticação, o perfil e os vínculos ativos. Esta ação é irreversível.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {!bloqueado && !depsQ.isLoading && (
              <div className="space-y-2">
                <Label htmlFor="confirmacao-exclusao">
                  Digite <span className="font-mono font-semibold">EXCLUIR</span> para confirmar
                </Label>
                <Input
                  id="confirmacao-exclusao"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="EXCLUIR"
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={excluirMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => excluirMut.mutate()}
            disabled={!podeExcluir || excluirMut.isPending}
          >
            {excluirMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Trash2 className="mr-2 h-4 w-4" /> Excluir definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
