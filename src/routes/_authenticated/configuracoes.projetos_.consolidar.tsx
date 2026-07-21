import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Merge,
  ShieldAlert,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute(
  "/_authenticated/configuracoes/projetos_/consolidar",
)({
  head: () => ({
    meta: [{ title: "Consolidar projetos · Configurações · CRM MK9" }],
  }),
  component: ConsolidarProjetosPage,
});

// ---------- Types (mirroring the RPCs) ----------
type DiagProjeto = {
  id: string;
  nome: string;
  nome_normalizado: string;
  codigo_interno: string | null;
  codigo_projeto: string | null;
  codigo_protocolo: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  qtd_colaboradores: number;
  qtd_ausencias: number;
  qtd_alertas: number;
  qtd_protocolos: number;
  qtd_usuarios: number;
  ultima_ausencia: string | null;
};
type DiagGrupo = {
  empresa_id: string;
  empresa_nome: string;
  chave: string;
  qtd: number;
  projetos: DiagProjeto[];
};
type Diagnostico = {
  total_grupos: number;
  total_projetos_envolvidos: number;
  grupos: DiagGrupo[];
};

type ProjetoVinculos = {
  colaboradores: number;
  ausencias: number;
  atestados: number;
  protocolos: number;
  alertas: number;
  usuarios: number;
  ai_conversations: number;
  comunicacoes: number;
  automacao_config: number;
  notificacoes: number;
  protocolo_sequencias: number;
};
type ProjetoLado = {
  id: string;
  nome: string;
  codigo_interno: string | null;
  codigo_projeto: string | null;
  codigo_protocolo: string | null;
  descricao: string | null;
  observacoes: string | null;
  ativo: boolean;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
  updated_at: string;
  vinculos: ProjetoVinculos;
};
type Preview = {
  empresa: { id: string; nome: string; cnpj: string | null };
  principal: ProjetoLado;
  duplicado: ProjetoLado;
  conflitos: Array<{ tipo: string; quantidade: number; resolucao: string }>;
  gerado_em: string;
};

type ExecResult = {
  ok: boolean;
  correlation_id: string;
  principal_id: string;
  duplicado_id: string;
  duplicado_arquivado: boolean;
  transferencias: Record<string, number>;
  concluido_em: string;
};

// ---------- Helpers ----------
const VINCULO_LABEL: Record<keyof ProjetoVinculos, string> = {
  colaboradores: "Colaboradores",
  ausencias: "Ausências",
  atestados: "Atestados (com arquivo)",
  protocolos: "Ausências com protocolo",
  alertas: "Alertas",
  usuarios: "Usuários vinculados",
  ai_conversations: "Conversas IA",
  comunicacoes: "Comunicações",
  automacao_config: "Configurações de automação",
  notificacoes: "Notificações",
  protocolo_sequencias: "Sequências de protocolo",
};

const TRANSFER_LABEL: Record<string, string> = {
  colaboradores: "Colaboradores transferidos",
  ausencias: "Ausências transferidas",
  alertas: "Alertas transferidos",
  usuario_projetos_transferidos: "Vínculos de usuário transferidos",
  usuario_projetos_conflitos_removidos: "Vínculos de usuário duplicados removidos",
  ai_conversations: "Conversas IA transferidas",
  comunicacoes: "Comunicações transferidas",
  automacao_config: "Automações transferidas",
  notificacoes: "Notificações transferidas",
  protocolo_sequencias_transferidas: "Sequências de protocolo transferidas",
  protocolo_sequencias_mescladas: "Sequências de protocolo mescladas (máximo mantido)",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

// ---------- Page ----------
function ConsolidarProjetosPage() {
  const { roles } = useSession();
  const canManage = roles?.includes("super_admin") || roles?.includes("rh");
  const qc = useQueryClient();

  const [grupoKey, setGrupoKey] = useState<string>("");
  const [principalId, setPrincipalId] = useState<string>("");
  const [duplicadoId, setDuplicadoId] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultado, setResultado] = useState<ExecResult | null>(null);

  const { data: diagnostico, isLoading: loadingDiag } = useQuery({
    queryKey: ["projetos-duplicados-diagnostico"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("diagnose_projetos_duplicados");
      if (error) throw error;
      return data as unknown as Diagnostico;
    },
    enabled: !!canManage,
  });

  const gruposDisponiveis = useMemo(() => {
    return (diagnostico?.grupos ?? []).filter((g) => g.projetos.length >= 2);
  }, [diagnostico]);

  const grupoSelecionado = useMemo(
    () => gruposDisponiveis.find((g) => `${g.empresa_id}::${g.chave}` === grupoKey) ?? null,
    [grupoKey, gruposDisponiveis],
  );

  const previewQ = useQuery({
    queryKey: ["consolidar-preview", principalId, duplicadoId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_consolidar_projetos", {
        p_principal_id: principalId,
        p_duplicado_id: duplicadoId,
      });
      if (error) throw error;
      return data as unknown as Preview;
    },
    enabled: !!principalId && !!duplicadoId && principalId !== duplicadoId,
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("consolidar_projetos", {
        p_principal_id: principalId,
        p_duplicado_id: duplicadoId,
        p_motivo: motivo?.trim() || undefined,
      });
      if (error) throw error;
      return data as unknown as ExecResult;
    },
    onSuccess: (data) => {
      setResultado(data);
      setConfirmOpen(false);
      toast.success("Projetos consolidados com sucesso.");
      qc.invalidateQueries({ queryKey: ["projetos-duplicados-diagnostico"] });
      qc.invalidateQueries({ queryKey: ["projetos"] });
      qc.invalidateQueries({ queryKey: ["consolidar-preview"] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Falha ao consolidar", { description: msg });
    },
  });

  // Reset ids when grupo changes
  function onSelectGrupo(v: string) {
    setGrupoKey(v);
    setPrincipalId("");
    setDuplicadoId("");
    setResultado(null);
  }

  if (!canManage) {
    return (
      <AppShell title="Consolidar projetos" breadcrumb={["Configurações", "Projetos", "Consolidar"]}>
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Sem permissão</p>
              <p className="text-sm text-muted-foreground">
                Apenas super admin ou RH podem consolidar projetos duplicados.
              </p>
            </div>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Consolidar projetos" breadcrumb={["Configurações", "Projetos", "Consolidar"]}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Transfere todos os vínculos de um projeto duplicado para o projeto principal e
            arquiva o duplicado. Nenhum registro é excluído fisicamente.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/configuracoes/projetos">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>

      {/* Passo 1 — grupo */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Merge className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">1. Escolha o grupo de projetos equivalentes</h2>
        </div>
        {loadingDiag ? (
          <Skeleton className="h-10 w-full" />
        ) : gruposDisponiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum grupo de projetos duplicados foi detectado.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Grupo</Label>
              <Select value={grupoKey} onValueChange={onSelectGrupo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um grupo" />
                </SelectTrigger>
                <SelectContent>
                  {gruposDisponiveis.map((g) => (
                    <SelectItem key={`${g.empresa_id}::${g.chave}`} value={`${g.empresa_id}::${g.chave}`}>
                      {g.empresa_nome} — “{g.chave}” ({g.qtd} projetos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {grupoSelecionado && (
              <div className="text-sm text-muted-foreground">
                <p><strong>Empresa:</strong> {grupoSelecionado.empresa_nome}</p>
                <p><strong>Chave normalizada:</strong> {grupoSelecionado.chave}</p>
                <p><strong>Projetos no grupo:</strong> {grupoSelecionado.qtd}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Passo 2 — escolha principal + duplicado */}
      {grupoSelecionado && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">2. Escolha o projeto principal e o duplicado</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Principal</th>
                  <th className="p-2">Duplicado</th>
                  <th className="p-2">Projeto</th>
                  <th className="p-2">Código</th>
                  <th className="p-2">Protocolo</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Colab.</th>
                  <th className="p-2 text-right">Ausências</th>
                  <th className="p-2 text-right">Protocolos</th>
                  <th className="p-2 text-right">Alertas</th>
                  <th className="p-2 text-right">Usuários</th>
                  <th className="p-2">Criado</th>
                </tr>
              </thead>
              <tbody>
                {grupoSelecionado.projetos.map((p) => {
                  const isPrincipal = principalId === p.id;
                  const isDuplicado = duplicadoId === p.id;
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/40">
                      <td className="p-2">
                        <input
                          type="radio"
                          name="principal"
                          checked={isPrincipal}
                          disabled={isDuplicado}
                          onChange={() => setPrincipalId(p.id)}
                          aria-label={`Escolher ${p.nome} como principal`}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="radio"
                          name="duplicado"
                          checked={isDuplicado}
                          disabled={isPrincipal}
                          onChange={() => setDuplicadoId(p.id)}
                          aria-label={`Escolher ${p.nome} como duplicado`}
                        />
                      </td>
                      <td className="p-2 font-medium">{p.nome}</td>
                      <td className="p-2 text-muted-foreground">{p.codigo_interno ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{p.codigo_protocolo ?? "—"}</td>
                      <td className="p-2">
                        <Badge variant={p.ativo ? "default" : "secondary"}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{p.qtd_colaboradores}</td>
                      <td className="p-2 text-right">{p.qtd_ausencias}</td>
                      <td className="p-2 text-right">{p.qtd_protocolos}</td>
                      <td className="p-2 text-right">{p.qtd_alertas}</td>
                      <td className="p-2 text-right">{p.qtd_usuarios}</td>
                      <td className="p-2 text-muted-foreground">{fmtDate(p.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Recomendação: escolha como principal o projeto com mais vínculos (colaboradores,
            ausências, protocolos) e o código de protocolo definido.
          </p>
        </Card>
      )}

      {/* Passo 3 — Preview */}
      {principalId && duplicadoId && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">3. Confira a comparação e os conflitos</h2>
            {previewQ.isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {previewQ.isError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {(previewQ.error as Error).message}
            </div>
          )}

          {previewQ.data && (
            <PreviewPanel preview={previewQ.data} />
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <div className="w-full sm:max-w-md">
              <Label>Motivo / observação (opcional)</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, 500))}
                placeholder="Ex.: mesma unidade AMBEV — grafia diferente na importação."
                rows={2}
              />
            </div>
            <Button
              disabled={!previewQ.data || executeMut.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Merge className="mr-2 h-4 w-4" /> Consolidar projetos
            </Button>
          </div>
        </Card>
      )}

      {/* Resultado */}
      {resultado && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-semibold">Consolidação concluída</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Correlação: <code>{resultado.correlation_id}</code> · Concluído em {fmtDateTime(resultado.concluido_em)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(resultado.transferencias).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="text-muted-foreground">{TRANSFER_LABEL[k] ?? k}</span>
                <span className="font-mono font-semibold">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            O projeto duplicado foi arquivado (status inativo) e mantém sua história para auditoria.
          </p>
        </Card>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar consolidação</DialogTitle>
            <DialogDescription>
              Todos os vínculos do projeto duplicado serão transferidos para o principal, e o
              duplicado será arquivado. A operação é registrada em auditoria e não pode ser
              desfeita automaticamente.
            </DialogDescription>
          </DialogHeader>
          {previewQ.data && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                <strong>Principal:</strong> {previewQ.data.principal.nome}
              </p>
              <p>
                <strong>Duplicado (será arquivado):</strong> {previewQ.data.duplicado.nome}
              </p>
              <p className="mt-1 text-muted-foreground">
                Empresa: {previewQ.data.empresa.nome}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={executeMut.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => executeMut.mutate()} disabled={executeMut.isPending}>
              {executeMut.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consolidando…</>
              ) : (
                <>Confirmar consolidação</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ---------- Preview panel ----------
function PreviewPanel({ preview }: { preview: Preview }) {
  const vinculoKeys = Object.keys(VINCULO_LABEL) as Array<keyof ProjetoVinculos>;
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Empresa: <strong>{preview.empresa.nome}</strong>
        {preview.empresa.cnpj ? <> · CNPJ {preview.empresa.cnpj}</> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <LadoCard titulo="Projeto principal" tone="principal" lado={preview.principal} />
        <LadoCard titulo="Projeto duplicado" tone="duplicado" lado={preview.duplicado} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Vínculos por tabela
        </h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Tabela</th>
                <th className="p-2 text-right">Principal</th>
                <th className="p-2 text-right">Duplicado (a transferir)</th>
                <th className="p-2 text-right">Total após consolidação</th>
              </tr>
            </thead>
            <tbody>
              {vinculoKeys.map((k) => (
                <tr key={k} className="border-t">
                  <td className="p-2">{VINCULO_LABEL[k]}</td>
                  <td className="p-2 text-right font-mono">{preview.principal.vinculos[k] ?? 0}</td>
                  <td className="p-2 text-right font-mono">{preview.duplicado.vinculos[k] ?? 0}</td>
                  <td className="p-2 text-right font-mono font-semibold">
                    {(preview.principal.vinculos[k] ?? 0) + (preview.duplicado.vinculos[k] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Conflitos detectados
        </h3>
        {preview.conflitos.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Nenhum conflito detectado.
          </div>
        ) : (
          <ul className="space-y-2">
            {preview.conflitos.map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="font-medium">{c.tipo} — {c.quantidade} caso(s)</p>
                  <p className="text-muted-foreground">{c.resolucao}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LadoCard({
  titulo,
  tone,
  lado,
}: {
  titulo: string;
  tone: "principal" | "duplicado";
  lado: ProjetoLado;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 text-sm " +
        (tone === "principal"
          ? "border-primary/40 bg-primary/5"
          : "border-amber-500/40 bg-amber-500/5")
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</span>
        <Badge variant={lado.ativo ? "default" : "secondary"}>
          {lado.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </div>
      <p className="mb-1 text-base font-semibold">{lado.nome}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Código interno</dt>
        <dd className="font-mono">{lado.codigo_interno ?? "—"}</dd>
        <dt className="text-muted-foreground">Código projeto</dt>
        <dd className="font-mono">{lado.codigo_projeto ?? "—"}</dd>
        <dt className="text-muted-foreground">Protocolo</dt>
        <dd className="font-mono">{lado.codigo_protocolo ?? "—"}</dd>
        <dt className="text-muted-foreground">Início</dt>
        <dd>{fmtDate(lado.data_inicio)}</dd>
        <dt className="text-muted-foreground">Fim</dt>
        <dd>{fmtDate(lado.data_fim)}</dd>
        <dt className="text-muted-foreground">Criado</dt>
        <dd>{fmtDateTime(lado.created_at)}</dd>
        <dt className="text-muted-foreground">Atualizado</dt>
        <dd>{fmtDateTime(lado.updated_at)}</dd>
      </dl>
      {lado.descricao && (
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Descrição:</strong> {lado.descricao}
        </p>
      )}
      {lado.observacoes && (
        <p className="mt-1 text-xs text-muted-foreground">
          <strong>Observações:</strong> {lado.observacoes}
        </p>
      )}
    </div>
  );
}
