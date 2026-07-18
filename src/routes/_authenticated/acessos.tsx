import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  KeyRound, Users, Activity, ShieldAlert, AlertTriangle, CheckCircle2,
  XCircle, Loader2, RefreshCw, Download, Search, Ban, ClipboardCheck, ScrollText,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/acessos")({
  head: () => ({ meta: [{ title: "Acessos · CRM MK9" }] }),
  component: AcessosPage,
});

function AcessosPage() {
  const { roles, loading } = useSession();
  if (loading) return <AppShell title="Acessos" breadcrumb={["Sistema", "Acessos"]}><Skeleton className="h-40 w-full" /></AppShell>;
  const canWrite = roles.includes("super_admin");
  const canRead = canWrite || roles.includes("compliance");
  if (!canRead) return <Navigate to="/dashboard" replace />;
  return <AcessosContent canWrite={canWrite} />;
}

type Dashboard = {
  usuarios_ativos: number; sessoes_ativas: number; sessoes_expiradas: number;
  sessoes_revogadas: number; logins_hoje: number; falhas_24h: number;
  revisoes_pendentes: number; revisoes_vencidas: number; permissoes_revogadas: number;
};

function AcessosContent({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");

  const dash = useQuery({
    queryKey: ["acessos_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("acessos_dashboard");
      if (error) throw error;
      return data as unknown as Dashboard;
    },
    refetchInterval: 60_000,
  });

  return (
    <AppShell title="Centro de Acessos" breadcrumb={["Sistema", "Acessos"]}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Governança de Acessos</h2>
            <p className="text-xs text-muted-foreground">
              Sessões, histórico de login e recertificação de permissões
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      <KpisGrid data={dash.data} loading={dash.isLoading} />

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="dashboard">Visão geral</TabsTrigger>
          <TabsTrigger value="sessoes">Sessões</TabsTrigger>
          <TabsTrigger value="logins">Histórico de Login</TabsTrigger>
          <TabsTrigger value="reviews">Recertificação</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            Use as abas acima para gerenciar sessões, auditar logins e conduzir
            campanhas de recertificação. Nenhum IP ou User-Agent é armazenado em
            texto puro — apenas hashes SHA-256 para rastreabilidade com privacidade.
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sessoes" className="mt-4">
          <SessoesTab canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="logins" className="mt-4">
          <LoginsTab />
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <ReviewsTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "danger" | "ok";
}) {
  const toneCls =
    tone === "danger" ? "text-destructive" :
    tone === "warn" ? "text-amber-600" :
    tone === "ok" ? "text-emerald-600" : "text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${toneCls}`} />
        </div>
        <div className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function KpisGrid({ data, loading }: { data?: Dashboard; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <Kpi icon={Users} label="Usuários ativos" value={data.usuarios_ativos} tone="ok" />
      <Kpi icon={Activity} label="Sessões ativas" value={data.sessoes_ativas} />
      <Kpi icon={XCircle} label="Sessões expiradas" value={data.sessoes_expiradas} tone="warn" />
      <Kpi icon={CheckCircle2} label="Logins hoje" value={data.logins_hoje} tone="ok" />
      <Kpi icon={ShieldAlert} label="Falhas (24h)" value={data.falhas_24h} tone="danger" />
      <Kpi icon={ClipboardCheck} label="Revisões pendentes" value={data.revisoes_pendentes} tone="warn" />
      <Kpi icon={Ban} label="Permissões revogadas" value={data.permissoes_revogadas} tone="danger" />
    </div>
  );
}

/* --------------------- SESSÕES --------------------- */
type Session = {
  id: string; user_id: string; provider: string | null; device: string | null;
  browser: string | null; os: string | null; cidade: string | null; pais: string | null;
  created_at: string; last_activity: string; expires_at: string | null;
  encerrada_em: string | null; motivo_encerramento: string | null;
  status: "ATIVA" | "ENCERRADA" | "EXPIRADA" | "REVOGADA";
};

function SessoesTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");

  const q = useQuery({
    queryKey: ["user_sessions", statusFilter],
    queryFn: async () => {
      let query = supabase.from("user_sessions").select("*").order("last_activity", { ascending: false }).limit(500);
      if (statusFilter !== "TODOS") query = query.eq("status", statusFilter as Session["status"]);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });

  const filtered = useMemo(() => {
    if (!busca) return q.data ?? [];
    const b = busca.toLowerCase();
    return (q.data ?? []).filter((s) =>
      [s.user_id, s.provider, s.device, s.browser, s.os, s.cidade, s.pais]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(b))
    );
  }, [q.data, busca]);

  const revogar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("revogar_sessao", { _session_id: id, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sessão revogada");
      qc.invalidateQueries({ queryKey: ["user_sessions"] });
      qc.invalidateQueries({ queryKey: ["acessos_dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportar = () => {
    const rows = filtered.map((s) => ({
      user_id: s.user_id, status: s.status, provider: s.provider,
      device: s.device, browser: s.browser, os: s.os,
      cidade: s.cidade, pais: s.pais,
      created_at: s.created_at, last_activity: s.last_activity,
      encerrada_em: s.encerrada_em, motivo: s.motivo_encerramento,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sessoes");
    XLSX.writeFile(wb, `sessoes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por usuário, dispositivo, local…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="ATIVA">Ativas</SelectItem>
            <SelectItem value="ENCERRADA">Encerradas</SelectItem>
            <SelectItem value="EXPIRADA">Expiradas</SelectItem>
            <SelectItem value="REVOGADA">Revogadas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
      </div>

      {q.isLoading ? <Skeleton className="h-40" /> : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma sessão encontrada.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.user_id.slice(0, 8)}…</TableCell>
                  <TableCell className="text-xs">{[s.device, s.browser, s.os].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-xs">{[s.cidade, s.pais].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(s.last_activity).toLocaleString("pt-BR")}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right">
                    {canWrite && s.status === "ATIVA" && (
                      <RevogarDialog onConfirm={(motivo) => revogar.mutate({ id: s.id, motivo })} pending={revogar.isPending} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent></Card>
  );
}

function StatusBadge({ status }: { status: Session["status"] | string }) {
  const map: Record<string, string> = {
    ATIVA: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    ENCERRADA: "bg-muted text-muted-foreground",
    EXPIRADA: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    REVOGADA: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return <Badge variant="outline" className={map[status] || ""}>{status}</Badge>;
}

function RevogarDialog({ onConfirm, pending }: { onConfirm: (m: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive"><Ban className="h-4 w-4 mr-1" /> Revogar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Revogar sessão</DialogTitle></DialogHeader>
        <Textarea placeholder="Motivo da revogação" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={pending || !motivo.trim()} onClick={() => { onConfirm(motivo); setOpen(false); setMotivo(""); }}>
            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------- LOGINS --------------------- */
type LoginEvent = {
  id: string; user_id: string | null; evento: string; provider: string | null;
  resultado: string; origem: string | null; created_at: string;
};

function LoginsTab() {
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["login_events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("login_events").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as LoginEvent[];
    },
  });

  const filtered = useMemo(() => {
    if (!busca) return q.data ?? [];
    const b = busca.toLowerCase();
    return (q.data ?? []).filter((e) =>
      [e.user_id, e.evento, e.provider, e.resultado, e.origem].filter(Boolean).some((v) => String(v).toLowerCase().includes(b))
    );
  }, [q.data, busca]);

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logins");
    XLSX.writeFile(wb, `login-events-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{e.user_id ? e.user_id.slice(0, 8) + "…" : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{e.evento}</Badge></TableCell>
                  <TableCell className="text-xs">{e.provider || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      e.resultado === "SUCESSO" ? "bg-emerald-500/10 text-emerald-600" :
                      e.resultado === "BLOQUEADO" ? "bg-amber-500/10 text-amber-600" :
                      "bg-destructive/10 text-destructive"
                    }>{e.resultado}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{e.origem || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent></Card>
  );
}

/* --------------------- REVIEWS --------------------- */
type Review = {
  id: string; usuario_id: string; usuario_nome: string | null; papel: string;
  status: "PENDENTE" | "APROVADA" | "REVOGADA" | "PRORROGADA";
  responsavel_nome: string | null; inicio: string; prazo: string;
  conclusao: string | null; observacoes: string | null;
};

function ReviewsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["access_reviews"],
    queryFn: async () => {
      const { data, error } = await supabase.from("access_reviews").select("*").order("prazo", { ascending: true }).limit(500);
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });

  const gerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("gerar_campanha_revisao", { _dias_prazo: 90 });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} revisão(ões) geradas`);
      qc.invalidateQueries({ queryKey: ["access_reviews"] });
      qc.invalidateQueries({ queryKey: ["acessos_dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decidir = useMutation({
    mutationFn: async ({ id, status, obs }: { id: string; status: Review["status"]; obs?: string }) => {
      const { error } = await supabase.from("access_reviews").update({
        status, conclusao: new Date().toISOString(), observacoes: obs ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revisão atualizada");
      qc.invalidateQueries({ queryKey: ["access_reviews"] });
      qc.invalidateQueries({ queryKey: ["acessos_dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Campanhas de recertificação. Prazo padrão: 90 dias.
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
            {gerar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <ClipboardCheck className="h-4 w-4 mr-1" /> Gerar campanha (90d)
          </Button>
        )}
      </div>

      {q.isLoading ? <Skeleton className="h-40" /> : (q.data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma revisão registrada.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((r) => {
                const venceu = r.status === "PENDENTE" && new Date(r.prazo) < new Date();
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.usuario_nome || r.usuario_id.slice(0, 8) + "…"}</TableCell>
                    <TableCell><Badge variant="outline">{r.papel}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(r.inicio).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-xs">
                      <span className={venceu ? "text-destructive font-medium" : ""}>
                        {new Date(r.prazo).toLocaleDateString("pt-BR")}
                        {venceu && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                      </span>
                    </TableCell>
                    <TableCell><ReviewStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right space-x-1">
                      {canWrite && r.status === "PENDENTE" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => decidir.mutate({ id: r.id, status: "APROVADA" })} disabled={decidir.isPending}>
                            <CheckCircle2 className="h-4 w-4 mr-1 text-emerald-600" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => decidir.mutate({ id: r.id, status: "REVOGADA" })} disabled={decidir.isPending}>
                            <Ban className="h-4 w-4 mr-1" /> Revogar
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent></Card>
  );
}

function ReviewStatusBadge({ status }: { status: Review["status"] }) {
  const map: Record<Review["status"], string> = {
    PENDENTE: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    APROVADA: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    REVOGADA: "bg-destructive/10 text-destructive border-destructive/20",
    PRORROGADA: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  };
  return <Badge variant="outline" className={map[status]}>{status}</Badge>;
}
