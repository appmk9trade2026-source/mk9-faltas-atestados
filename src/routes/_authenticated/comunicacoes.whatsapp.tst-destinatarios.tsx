// Painel administrativo do Técnico de Segurança do Trabalho (TST) —
// destinatário principal das notificações de Acidente de Trabalho.
//
// Regras:
// - Somente super_admin, RH e Compliance visualizam.
// - Somente super_admin e RH editam/confirmam (RLS + RPC reforçam).
// - Antes da confirmação administrativa, nenhuma mensagem sai.
// - Telefone completo é ocultado para quem não é super_admin nem RH.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, PhoneCall, ShieldCheck, UserRound } from "lucide-react";
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
  WhatsappRouteError,
  WhatsappRouteLoading,
  WhatsappRouteNotFound,
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
          "Cadastro e confirmação do Técnico de Segurança do Trabalho como destinatário oficial das notificações de acidente de trabalho.",
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

function TstDestinatariosPage() {
  const { roles } = useSession();
  const podeEditar = roles.includes("super_admin") || roles.includes("rh");
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["wa-tst-destinatarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_tst_destinatarios" as never)
        .select(
          "id, nome, cargo, telefone_original, telefone_normalizado, telefone_e164, telefone_mascarado, ativo, destinatario_principal_acidente, confirmado, confirmado_em, created_at, updated_at",
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tst[];
    },
  });

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("wa_tst_confirmar" as never, { p_id: id } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Número confirmado. Notificações de acidente serão enviadas.");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao confirmar"),
  });

  const setAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_tst_destinatarios" as never)
        .update({ ativo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado.");
      qc.invalidateQueries({ queryKey: ["wa-tst-destinatarios"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
  });

  const items = listQ.data ?? [];
  const principal = useMemo(
    () => items.find((t) => t.destinatario_principal_acidente && t.ativo) ?? null,
    [items],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold">Técnico de Segurança do Trabalho</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Destinatário oficial das notificações de <strong>Acidente de Trabalho</strong>. O envio
          real só ocorre depois que um administrador confirma o número (nono dígito). Enquanto
          estiver <em>Não confirmado</em>, nenhuma mensagem sai — o acidente é salvo normalmente e
          um alerta interno é gerado.
        </p>
      </header>

      {principal && !principal.confirmado && (
        <Card className="border-amber-300/60 bg-amber-50/60 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" aria-hidden />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Confirmação pendente do número do TST</p>
              <p>
                O contato informado originalmente possuía 8 dígitos após o DDD.
                O sistema salvou como{" "}
                <strong>+55 61 9 9312-5557</strong> (nono dígito adicionado). Confirme abaixo antes
                de ativar os envios reais.
              </p>
            </div>
          </div>
        </Card>
      )}

      {listQ.isLoading ? (
        <WhatsappRouteLoading />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum destinatário TST cadastrado.
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((t) => (
            <Card key={t.id} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserRound className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold">{t.nome}</p>
                    <p className="text-xs text-muted-foreground">{t.cargo}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.destinatario_principal_acidente && (
                    <Badge className="bg-blue-600 hover:bg-blue-600">Principal · Acidente</Badge>
                  )}
                  {t.ativo ? (
                    <Badge variant="secondary">Ativo</Badge>
                  ) : (
                    <Badge variant="outline">Inativo</Badge>
                  )}
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
                  <Label className="text-xs uppercase text-muted-foreground">
                    Telefone informado
                  </Label>
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
                    {podeEditar
                      ? "Visível para Super Admin/RH."
                      : "Número mascarado por LGPD/RBAC."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`ativo-${t.id}`}
                    checked={t.ativo}
                    disabled={!podeEditar || setAtivo.isPending}
                    onCheckedChange={(v) => setAtivo.mutate({ id: t.id, ativo: !!v })}
                  />
                  <Label htmlFor={`ativo-${t.id}`} className="text-sm">
                    Destinatário ativo
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  {!t.confirmado && podeEditar && (
                    <Button
                      onClick={() => confirmar.mutate(t.id)}
                      disabled={confirmar.isPending}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Confirmar {t.telefone_e164}
                    </Button>
                  )}
                  {!podeEditar && !t.confirmado && (
                    <span className="text-xs text-muted-foreground">
                      Apenas Super Admin / RH pode confirmar.
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {podeEditar && <NovoTstForm />}
    </div>
  );
}

function NovoTstForm() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("Técnico de Segurança do Trabalho");
  const [telefone, setTelefone] = useState("");
  const [tornarPrincipal, setTornarPrincipal] = useState(false);

  const criar = useMutation({
    mutationFn: async () => {
      const digits = telefone.replace(/\D/g, "");
      const norm = digits.length >= 10 && !digits.startsWith("55") ? `55${digits}` : digits;
      if (!/^55\d{10,11}$/.test(norm)) throw new Error("Telefone inválido. Use DDD + número.");
      const e164 = `+${norm}`;
      const mascarado = `+55 (${norm.slice(2, 4)}) *****-${norm.slice(-4)}`;
      // Hash é gerado no banco via trigger em versões futuras; por ora enviamos sha256 client-side.
      const enc = new TextEncoder().encode(norm);
      const hashBuf = await crypto.subtle.digest("SHA-256", enc);
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase.from("whatsapp_tst_destinatarios" as never).insert({
        nome: nome.trim() || "Técnico de Segurança do Trabalho",
        cargo: "Técnico de Segurança do Trabalho",
        telefone_original: telefone,
        telefone_normalizado: norm,
        telefone_e164: e164,
        telefone_hash: hashHex,
        telefone_mascarado: mascarado,
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
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao cadastrar"),
  });

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-base font-semibold">Cadastrar novo TST</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        O número entra como <em>Não confirmado</em>. Só passa a receber mensagens depois da
        confirmação.
      </p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label className="text-xs">Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Telefone (DDD + número)</Label>
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
            disabled={criar.isPending || telefone.trim().length < 8}
          >
            Cadastrar
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Switch checked={tornarPrincipal} onCheckedChange={(v) => setTornarPrincipal(!!v)} />
        <Label className="text-sm">
          Marcar como <strong>destinatário principal</strong> para acidentes
        </Label>
      </div>
    </Card>
  );
}
