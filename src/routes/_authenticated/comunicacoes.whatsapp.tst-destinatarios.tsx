// Painel administrativo do Técnico de Segurança do Trabalho (TST) —
// destinatário oficial das notificações de Acidente de Trabalho, por empresa.
//
// Regras:
// - Só super_admin, RH e Compliance visualizam.
// - Só super_admin e RH editam/confirmam (RLS + RPC reforçam).
// - Hash SHA-256 e normalização do telefone são gerados pelo banco (triggers).
// - Cada empresa tem 1 principal ativo; nunca envia usando TST de outra empresa.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Building2, Check, PhoneCall, ShieldCheck, UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  WhatsappRouteError, WhatsappRouteLoading, WhatsappRouteNotFound,
} from "@/components/whatsapp/route-boundaries";

export const Route = createFileRoute(
  "/_authenticated/comunicacoes/whatsapp/tst-destinatarios",
)({
  head: () => ({
    meta: [
      { title: "TST Destinatários · WhatsApp · CRM MK9" },
      {
        name: "description",
        content:
          "Cadastro por empresa e confirmação do Técnico de Segurança do Trabalho como destinatário oficial das notificações de acidente.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TstDestinatariosPage,
  pendingComponent: () => <WhatsappRouteLoading />,
  errorComponent: ({ error, reset }) => (
    <WhatsappRouteError error={error} reset={reset} title="Não foi possível carregar os destinatários TST." />
  ),
  notFoundComponent: () => <WhatsappRouteNotFound />,
});

type Tst = {
  id: string;
  empresa_id: string | null;
  nome: string;
  cargo: string;
  telefone_original: string;
  telefone_normalizado: string;
  telefone_e164: string;
  telefone_mascarado: string;
  ativo: boolean;
  destinatario_principal_acidente: boolean;
  confirmado: boolean;
  confirmado_em: string | null;
  created_at: string;
  updated_at: string;
};

type Empresa = { id: string; nome: string };

type Monitor = {
  empresas_ativas: number;
  empresas_sem_tst: number;
  empresas_sem_confirmacao: number;
  tsts_sem_empresa: number;
  falhas_24h: number;
  alertas_sem_tst_abertos: number;
  ultimo_envio_em: string | null;
};

function TstDestinatariosPage() {
  const { roles } = useSession();
  const podeEditar = roles.includes("super_admin") || roles.includes("rh");
  const qc = useQueryClient();
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");
  const [filtroConfirmado, setFiltroConfirmado] = useState<"todos" | "sim" | "nao">("todos");

  const empresasQ = useQuery({
    queryKey: ["empresas-ativas-tst"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas").select("id, nome").eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  const listQ = useQuery({
    queryKey: ["wa-tst-destinatarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_tst_destinatarios" as never)
        .select(
          "id, empresa_id, nome, cargo, telefone_original, telefone_normalizado, telefone_e164, telefone_mascarado, ativo, destinatario_principal_acidente, confirmado, confirmado_em, created_at, updated_at",
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tst[];
    },
  });

  const monitorQ = useQuery({
    queryKey: ["wa-tst-monitor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_tst_monitor" as never)
        .select("*").maybeSingle();
      if (error) throw error;
      return (data as unknown as Monitor) ?? null;
    },
  });

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Sessão expirada. Faça login novamente.");
      const { error } = await supabase.rpc(
        "wa_tst_confirmar" as never,
        { p_id: id, p_ip: null } as never,
      );
      if (error) {
        console.error("[wa_tst_confirmar] falhou", {
          rpc: "wa_tst_confirmar",
          destinatario_id: id,
          usuario_id: userData.user.id,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        const codeSuffix = error.code ? ` (${error.code})` : "";
        throw new Error(`${error.message || "Falha ao confirmar"}${codeSuffix}`);
      }
    },
    onSuccess: () => {
      toast.success("Telefone do TST confirmado com sucesso.");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
      qc.invalidateQueries({ queryKey: ["wa-tst-monitor"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao confirmar"),
  });

  const setAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_tst_destinatarios" as never)
        .update({ ativo } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado.");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
      qc.invalidateQueries({ queryKey: ["wa-tst-monitor"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
  });

  const setEmpresa = useMutation({
    mutationFn: async ({ id, empresa_id }: { id: string; empresa_id: string }) => {
      const { error } = await supabase
        .from("whatsapp_tst_destinatarios" as never)
        .update({ empresa_id } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa vinculada.");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
      qc.invalidateQueries({ queryKey: ["wa-tst-monitor"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao vincular empresa"),
  });

  const setPrincipal = useMutation({
    mutationFn: async ({ id, principal }: { id: string; principal: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_tst_destinatarios" as never)
        .update({ destinatario_principal_acidente: principal } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Principal atualizado (os demais da empresa foram desmarcados).");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
      qc.invalidateQueries({ queryKey: ["wa-tst-monitor"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao definir principal"),
  });

  const empresas = empresasQ.data ?? [];
  const empresaNome = (id: string | null) =>
    empresas.find((e) => e.id === id)?.nome ?? "—";

  const items = useMemo(() => {
    const raw = listQ.data ?? [];
    return raw.filter((t) => {
      if (filtroEmpresa && t.empresa_id !== filtroEmpresa) return false;
      if (filtroConfirmado === "sim" && !t.confirmado) return false;
      if (filtroConfirmado === "nao" && t.confirmado) return false;
      return true;
    });
  }, [listQ.data, filtroEmpresa, filtroConfirmado]);

  const monitor = monitorQ.data;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold">Técnico de Segurança do Trabalho — por empresa</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Destinatários oficiais das notificações de <strong>Acidente de Trabalho</strong>.
          Cada empresa tem seu próprio TST; o envio real só ocorre depois que um administrador
          confirma o número. Enquanto <em>Não confirmado</em>, o acidente é salvo normalmente e
          um alerta interno é gerado.
        </p>
      </header>

      {monitor && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MonitorTile label="Empresas ativas" value={monitor.empresas_ativas} />
          <MonitorTile label="Sem TST" value={monitor.empresas_sem_tst} tone={monitor.empresas_sem_tst > 0 ? "warn" : "ok"} />
          <MonitorTile label="Sem confirmação" value={monitor.empresas_sem_confirmacao} tone={monitor.empresas_sem_confirmacao > 0 ? "warn" : "ok"} />
          <MonitorTile label="TSTs sem empresa" value={monitor.tsts_sem_empresa} tone={monitor.tsts_sem_empresa > 0 ? "danger" : "ok"} />
          <MonitorTile label="Falhas (24h)" value={monitor.falhas_24h} tone={monitor.falhas_24h > 0 ? "danger" : "ok"} />
          <MonitorTile label="Alertas SEM_DESTINATARIO abertos" value={monitor.alertas_sem_tst_abertos} tone={monitor.alertas_sem_tst_abertos > 0 ? "warn" : "ok"} />
          <MonitorTile
            label="Último envio"
            value={monitor.ultimo_envio_em ? new Date(monitor.ultimo_envio_em).toLocaleString("pt-BR") : "—"}
          />
        </div>
      )}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56">
          <Label className="text-xs">Empresa</Label>
          <Select value={filtroEmpresa || "todas"} onValueChange={(v) => setFiltroEmpresa(v === "todas" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-48">
          <Label className="text-xs">Confirmação</Label>
          <Select value={filtroConfirmado} onValueChange={(v) => setFiltroConfirmado(v as typeof filtroConfirmado)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="sim">Confirmados</SelectItem>
              <SelectItem value="nao">Não confirmados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {listQ.isLoading ? (
        <WhatsappRouteLoading />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum destinatário TST para os filtros atuais.
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((t) => {
            const semEmpresa = !t.empresa_id;
            return (
              <Card key={t.id} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <p className="font-semibold">{t.nome}</p>
                      <p className="text-xs text-muted-foreground">{t.cargo}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className={semEmpresa ? "text-destructive" : ""}>
                          {semEmpresa ? "Sem empresa vinculada" : empresaNome(t.empresa_id)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {semEmpresa && <Badge variant="destructive">Sem empresa</Badge>}
                    {t.destinatario_principal_acidente && (
                      <Badge className="bg-blue-600 hover:bg-blue-600">Principal</Badge>
                    )}
                    {t.ativo ? <Badge variant="secondary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                    {t.confirmado ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">
                        <Check className="mr-1 h-3.5 w-3.5" /> Confirmado
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Não confirmado</Badge>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Telefone informado</Label>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <PhoneCall className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span>{t.telefone_original}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">
                      Formato E.164 (usado no envio)
                    </Label>
                    <div className="mt-1 font-mono text-sm">
                      {podeEditar ? t.telefone_e164 : t.telefone_mascarado}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {podeEditar ? "Visível para Super Admin/RH." : "Número mascarado por LGPD/RBAC."}
                    </p>
                  </div>
                </div>

                {semEmpresa && podeEditar && (
                  <div className="border-t bg-amber-50/50 p-4 dark:bg-amber-950/20">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-56 flex-1">
                        <Label className="text-xs">Vincular à empresa</Label>
                        <Select onValueChange={(v) => setEmpresa.mutate({ id: t.id, empresa_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Escolher empresa" /></SelectTrigger>
                          <SelectContent>
                            {empresas.map((e) => (
                              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`ativo-${t.id}`}
                        checked={t.ativo}
                        disabled={!podeEditar || setAtivo.isPending}
                        onCheckedChange={(v) => setAtivo.mutate({ id: t.id, ativo: !!v })}
                      />
                      <Label htmlFor={`ativo-${t.id}`} className="text-sm">Ativo</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`principal-${t.id}`}
                        checked={t.destinatario_principal_acidente}
                        disabled={!podeEditar || semEmpresa || setPrincipal.isPending}
                        onCheckedChange={(v) => setPrincipal.mutate({ id: t.id, principal: !!v })}
                      />
                      <Label htmlFor={`principal-${t.id}`} className="text-sm">Principal (acidente)</Label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!t.confirmado && podeEditar && !semEmpresa && (
                      <Button onClick={() => confirmar.mutate(t.id)} disabled={confirmar.isPending} className="gap-2">
                        <Check className="h-4 w-4" /> Confirmar {t.telefone_e164}
                      </Button>
                    )}
                    {semEmpresa && (
                      <span className="text-xs text-muted-foreground">
                        Vincule uma empresa antes de confirmar.
                      </span>
                    )}
                    {!podeEditar && !t.confirmado && (
                      <span className="text-xs text-muted-foreground">
                        Apenas Super Admin / RH pode confirmar.
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {podeEditar && <NovoTstForm empresas={empresas} />}

      {!empresasQ.isLoading && !empresas.length && (
        <Card className="border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden />
          Nenhuma empresa ativa. Cadastre uma empresa antes de vincular TSTs.
        </Card>
      )}
    </div>
  );
}

function MonitorTile({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "danger" }) {
  const cls =
    tone === "danger" ? "border-destructive/40 bg-destructive/5" :
    tone === "warn"   ? "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30" :
                        "";
  return (
    <Card className={`p-4 ${cls}`}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function NovoTstForm({ empresas }: { empresas: Empresa[] }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("Técnico de Segurança do Trabalho");
  const [telefone, setTelefone] = useState("");
  const [empresaId, setEmpresaId] = useState<string>("");
  const [tornarPrincipal, setTornarPrincipal] = useState(true);

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecione a empresa");
      if (telefone.replace(/\D/g, "").length < 10) throw new Error("Telefone incompleto");

      // Hash e normalização são gerados pelo banco (trigger BEFORE INSERT).
      const { error } = await supabase.from("whatsapp_tst_destinatarios" as never).insert({
        nome: nome.trim() || "Técnico de Segurança do Trabalho",
        cargo: "Técnico de Segurança do Trabalho",
        empresa_id: empresaId,
        telefone_original: telefone,
        // Campos abaixo são obrigatórios no schema legado mas serão sobrescritos
        // pela trigger; enviamos placeholders para satisfazer NOT NULL.
        telefone_normalizado: "55" + telefone.replace(/\D/g, ""),
        telefone_e164: "+55" + telefone.replace(/\D/g, ""),
        telefone_hash: "pending",
        telefone_mascarado: "pending",
        ativo: true,
        destinatario_principal_acidente: tornarPrincipal,
        confirmado: false,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("TST cadastrado. Confirme o número para ativar os envios.");
      setTelefone("");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
      qc.invalidateQueries({ queryKey: ["wa-tst-monitor"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao cadastrar"),
  });

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-base font-semibold">Cadastrar novo TST</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        O número entra como <em>Não confirmado</em>. Só passa a receber mensagens depois da
        confirmação. Hash SHA-256 e normalização são gerados pelo banco.
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">Empresa *</Label>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Telefone (DDD + número) *</Label>
          <Input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(61) 99312-5557"
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            onClick={() => criar.mutate()}
            disabled={criar.isPending || !empresaId || telefone.trim().length < 8}
          >
            Cadastrar
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Switch checked={tornarPrincipal} onCheckedChange={(v) => setTornarPrincipal(!!v)} />
        <Label className="text-sm">
          Marcar como <strong>principal</strong> desta empresa
        </Label>
      </div>
    </Card>
  );
}
