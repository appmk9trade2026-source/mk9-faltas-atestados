import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert,
  Search,
  Building2,
  FolderKanban,
  Link2,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { friendlyRbacError } from "@/lib/rbac/errors";

export const Route = createFileRoute("/_authenticated/administracao/pendencias-supervisor")({
  head: () => ({
    meta: [
      { title: "Pendências de Supervisor · CRM MK9" },
      { name: "description", content: "Auditoria e correção de vínculos de supervisor em colaboradores." },
      { property: "og:title", content: "Pendências de Supervisor · CRM MK9" },
      { property: "og:description", content: "Auditoria e correção manual segura de vínculos de supervisor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendenciasPage,
});

type Pendencia = {
  colaborador_id: string;
  matricula: string | null;
  nome_completo: string;
  empresa_id: string | null;
  empresa_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  supervisor_nome: string | null;
  supervisor_email: string | null;
  supervisor_usuario_id: string | null;
  motivo: string;
  criado_em: string;
  atualizado_em: string;
  total_geral: number;
};

type Supervisor = { id: string; nome_completo: string; email: string; matricula: string | null };

const MOTIVOS: Array<{ v: string; label: string; color: string }> = [
  { v: "SUPERVISOR_NAO_INFORMADO", label: "Não informado", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  { v: "SUPERVISOR_NAO_ENCONTRADO", label: "Não encontrado", color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  { v: "SUPERVISOR_EMAIL_AMBIGUO", label: "E-mail ambíguo", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  { v: "SUPERVISOR_INATIVO", label: "Inativo", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  { v: "USUARIO_SEM_PAPEL_SUPERVISOR", label: "Sem papel supervisor", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  { v: "SUPERVISOR_ID_INVALIDO", label: "UUID inválido", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
];

function motivoMeta(m: string) {
  return MOTIVOS.find((x) => x.v === m) ?? { v: m, label: m, color: "bg-muted" };
}

function PendenciasPage() {
  const { role, sessionLoading } = useSession();
  const qc = useQueryClient();
  const [motivo, setMotivo] = React.useState<string>("__all__");
  const [empresaId, setEmpresaId] = React.useState<string>("__all__");
  const [projetoId, setProjetoId] = React.useState<string>("__all__");
  const [busca, setBusca] = React.useState("");
  const [debouncedBusca, setDebouncedBusca] = React.useState("");
  const [pagina, setPagina] = React.useState(0);
  const pageSize = 50;
  const [selecionado, setSelecionado] = React.useState<Pendencia | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedBusca(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const permitido = role === "super_admin" || role === "rh";

  const auditoria = useQuery({
    queryKey: ["supervisor-integridade"],
    enabled: !sessionLoading && permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_auditoria_supervisor_integridade" as never);
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  const empresas = useQuery({
    queryKey: ["empresas-min"],
    enabled: !sessionLoading && permitido,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as Array<{ id: string; nome: string }>;
    },
  });

  const projetos = useQuery({
    queryKey: ["projetos-min", empresaId],
    enabled: !sessionLoading && permitido,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome");
      if (empresaId !== "__all__") q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Array<{ id: string; nome: string; empresa_id: string }>;
    },
  });

  const pendencias = useQuery({
    queryKey: ["pendencias-supervisor", motivo, empresaId, projetoId, debouncedBusca, pagina],
    enabled: !sessionLoading && permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_listar_pendencias_supervisor" as never, {
        _motivo: motivo === "__all__" ? null : motivo,
        _empresa_id: empresaId === "__all__" ? null : empresaId,
        _projeto_id: projetoId === "__all__" ? null : projetoId,
        _busca: debouncedBusca || null,
        _limit: pageSize,
        _offset: pagina * pageSize,
      } as never);
      if (error) throw error;
      return (data ?? []) as Pendencia[];
    },
  });

  const total = pendencias.data?.[0]?.total_geral ?? 0;

  if (!sessionLoading && !permitido) {
    return (
      <AppShell title="Pendências de Supervisor">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Apenas Super Admin e RH podem acessar esta área.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Pendências de Supervisor" breadcrumb={["Administração", "Pendências de Supervisor"]}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Integridade de vínculos de supervisor</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Colaboradores ativos sem <code className="rounded bg-muted px-1">supervisor_usuario_id</code> canônico.
            Vincule manualmente somente Supervisores válidos — o sistema nunca vincula por similaridade de nome.
          </p>
        </div>

        {/* Auditoria preventiva */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "colaboradores_ativos", label: "Colaboradores ativos", tone: "" },
            { k: "sem_supervisor", label: "Sem supervisor informado", tone: "text-slate-600" },
            { k: "email_sem_uid", label: "E-mail sem UUID resolvido", tone: "text-amber-600" },
            { k: "uid_sem_papel", label: "UUID sem papel supervisor", tone: "text-purple-600" },
            { k: "uid_inexistente", label: "UUID inexistente", tone: "text-rose-600" },
            { k: "supervisor_inativo", label: "Supervisor inativo", tone: "text-orange-600" },
            { k: "email_divergente", label: "E-mail divergente do supervisor", tone: "text-red-600" },
          ].map((it) => (
            <Card key={it.k} className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{it.label}</div>
              <div className={`mt-1 text-2xl font-semibold ${it.tone}`}>
                {auditoria.isLoading ? <Skeleton className="h-7 w-16" /> : (auditoria.data?.[it.k] ?? 0)}
              </div>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">Buscar (nome, matrícula, e-mail)</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Ex.: alexandre@..." className="pl-8" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Motivo</label>
              <Select value={motivo} onValueChange={(v) => { setMotivo(v); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os motivos</SelectItem>
                  {MOTIVOS.map((m) => (
                    <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Empresa</label>
              <Select value={empresaId} onValueChange={(v) => { setEmpresaId(v); setProjetoId("__all__"); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {empresas.data?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Projeto</label>
              <Select value={projetoId} onValueChange={(v) => { setProjetoId(v); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {projetos.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => { pendencias.refetch(); auditoria.refetch(); }}>
                <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>
        </Card>

        {/* Tabela */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b p-3 text-xs text-muted-foreground">
            <span>{pendencias.isLoading ? "Carregando…" : `${total} pendência(s)`}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => Math.max(0, p - 1))}>Anterior</Button>
              <span>Página {pagina + 1}</span>
              <Button size="sm" variant="ghost" disabled={(pagina + 1) * pageSize >= total} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Empresa / Projeto</TableHead>
                  <TableHead>Supervisor informado</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Importado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendencias.isLoading && (
                  <TableRow><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                )}
                {!pendencias.isLoading && (pendencias.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                      Nenhuma pendência com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
                {(pendencias.data ?? []).map((p) => {
                  const m = motivoMeta(p.motivo);
                  return (
                    <TableRow key={p.colaborador_id}>
                      <TableCell className="font-medium">{p.nome_completo}</TableCell>
                      <TableCell className="font-mono text-xs">{p.matricula ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1"><Building2 className="h-3 w-3" />{p.empresa_nome ?? "—"}</div>
                        <div className="flex items-center gap-1 text-muted-foreground"><FolderKanban className="h-3 w-3" />{p.projeto_nome ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{p.supervisor_nome ?? <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-muted-foreground">{p.supervisor_email ?? "—"}</div>
                      </TableCell>
                      <TableCell><Badge className={m.color}>{m.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(p.criado_em).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => setSelecionado(p)}>
                          <Link2 className="mr-2 h-4 w-4" /> Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <VincularDialog
        pendencia={selecionado}
        onClose={() => setSelecionado(null)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["pendencias-supervisor"] });
          qc.invalidateQueries({ queryKey: ["supervisor-integridade"] });
          qc.invalidateQueries({ queryKey: ["coordenacao-supervisores"] });
        }}
      />
    </AppShell>
  );
}

function VincularDialog({
  pendencia,
  onClose,
  onSuccess,
}: {
  pendencia: Pendencia | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busca, setBusca] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBusca(""); setDebounced(""); setSelectedId(null);
  }, [pendencia?.colaborador_id]);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const supervisores = useQuery({
    queryKey: ["admin-buscar-supervisores", debounced],
    enabled: !!pendencia,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_buscar_supervisores" as never, {
        _busca: debounced || pendencia?.supervisor_email || null,
        _limit: 20,
      } as never);
      if (error) throw error;
      return (data ?? []) as Supervisor[];
    },
  });

  const vincular = useMutation({
    mutationFn: async () => {
      if (!pendencia || !selectedId) throw new Error("Selecione um supervisor.");
      const { data, error } = await supabase.rpc("confirmar_vinculo_supervisor" as never, {
        _colaborador_id: pendencia.colaborador_id,
        _supervisor_usuario_id: selectedId,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Vínculo confirmado com sucesso.");
      onSuccess(); onClose();
    },
    onError: (e) => {
      const f = friendlyRbacError(e);
      toast.error(f.title, { description: f.description });
    },
  });

  const selecionado = supervisores.data?.find((s) => s.id === selectedId);

  return (
    <Dialog open={!!pendencia} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular supervisor a {pendencia?.nome_completo}</DialogTitle>
          <DialogDescription>
            Somente usuários ativos com papel <b>supervisor</b> são listados. A alteração é registrada em auditoria.
          </DialogDescription>
        </DialogHeader>

        {pendencia && (
          <div className="space-y-3">
            <Card className="border-dashed p-3 text-xs">
              <div className="grid gap-1 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Matrícula:</span> <b className="font-mono">{pendencia.matricula ?? "—"}</b></div>
                <div><span className="text-muted-foreground">Empresa:</span> {pendencia.empresa_nome ?? "—"}</div>
                <div><span className="text-muted-foreground">Projeto:</span> {pendencia.projeto_nome ?? "—"}</div>
                <div><span className="text-muted-foreground">Motivo:</span> <Badge className={motivoMeta(pendencia.motivo).color}>{motivoMeta(pendencia.motivo).label}</Badge></div>
                <div className="sm:col-span-2 rounded border bg-muted/30 p-2">
                  <div className="text-muted-foreground">Informado no arquivo:</div>
                  <div>{pendencia.supervisor_nome ?? "—"} · <code>{pendencia.supervisor_email ?? "—"}</code></div>
                </div>
              </div>
            </Card>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar supervisor por nome, e-mail ou matrícula…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="max-h-[280px] overflow-auto rounded-md border">
              {supervisores.isLoading && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin" /> Buscando…
                </div>
              )}
              {!supervisores.isLoading && (supervisores.data ?? []).length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <AlertTriangle className="mx-auto mb-1 h-4 w-4 text-amber-500" />
                  Nenhum supervisor ativo encontrado com este critério.
                </div>
              )}
              {(supervisores.data ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`flex w-full items-center justify-between border-b p-3 text-left text-sm transition last:border-0 hover:bg-muted/50 ${selectedId === s.id ? "bg-primary/10" : ""}`}
                >
                  <div>
                    <div className="font-medium">{s.nome_completo}</div>
                    <div className="text-xs text-muted-foreground">{s.email} {s.matricula ? `· mat. ${s.matricula}` : ""}</div>
                  </div>
                  {selectedId === s.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>

            {selecionado && (
              <Card className="border-emerald-400/40 bg-emerald-500/5 p-3 text-xs">
                <div className="font-semibold">Impacto da alteração</div>
                <div className="mt-1 text-muted-foreground">
                  O colaborador <b>{pendencia.nome_completo}</b> passará a ser gerido por{" "}
                  <b>{selecionado.nome_completo}</b> ({selecionado.email}). O e-mail auxiliar
                  será atualizado para o e-mail do supervisor selecionado.
                </div>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!selectedId || vincular.isPending} onClick={() => vincular.mutate()}>
            {vincular.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Confirmar vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
