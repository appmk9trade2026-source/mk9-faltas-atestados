import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Palette, Pencil, Save, Search, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

export const Route = createFileRoute("/_authenticated/configuracoes/tipos-ausencia")({
  head: () => ({ meta: [{ title: "Tipos de Ausência · CRM MK9" }] }),
  component: TiposAusenciaPage,
});

type Tipo = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
  ordem: number;
  ativo: boolean;
  exige_documento: boolean;
  permite_cid: boolean;
  permite_acidente: boolean;
};

type Opcao = {
  id: string;
  codigo: string;
  nome: string;
  quantidade_dias: number | null;
  tipo_periodo: "DIAS" | "HORAS" | "MEIO_PERIODO" | "PERIODO_INTEGRAL";
  ativo: boolean;
  ordem: number;
};

type Vinculo = {
  id: string;
  tipo_ausencia_id: string;
  opcao_periodo_id: string;
  ativo: boolean;
};

function TiposAusenciaPage() {
  const { roles, loading: sessionLoading } = useSession();
  const isAdmin = roles.includes("super_admin");
  const podeVer = isAdmin || roles.includes("rh") || roles.includes("compliance");
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editing, setEditing] = useState<Tipo | null>(null);
  const [configuring, setConfiguring] = useState<Tipo | null>(null);

  const tiposQ = useQuery({
    queryKey: ["tipos_ausencia"],
    queryFn: async (): Promise<Tipo[]> => {
      const { data, error } = await supabase
        .from("tipos_ausencia" as never)
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tipo[];
    },
    enabled: podeVer,
  });

  const opcoesQ = useQuery({
    queryKey: ["opcoes_periodo_ausencia"],
    queryFn: async (): Promise<Opcao[]> => {
      const { data, error } = await supabase
        .from("opcoes_periodo_ausencia" as never)
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Opcao[];
    },
    enabled: podeVer,
  });

  const filtered = useMemo(() => {
    const t = tiposQ.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return t;
    return t.filter(
      (x) => x.nome.toLowerCase().includes(q) || x.codigo.toLowerCase().includes(q),
    );
  }, [tiposQ.data, busca]);

  const toggleAtivoMut = useMutation({
    mutationFn: async (t: Tipo) => {
      const { error } = await supabase
        .from("tipos_ausencia" as never)
        .update({ ativo: !t.ativo } as never)
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tipos_ausencia"] });
      toast.success("Status atualizado.");
    },
    onError: (e: unknown) =>
      toast.error("Não foi possível atualizar.", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  if (!podeVer) {
    return (
      <AppShell title="Tipos de Ausência" breadcrumb={["Configurações", "Tipos de Ausência"]}>
        <Card className="p-8 text-sm text-muted-foreground">
          Seu papel não tem acesso a esta configuração.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Tipos de Ausência" breadcrumb={["Configurações", "Tipos de Ausência"]}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          19 tipos oficiais MK9. Configure o período permitido por tipo em <em>Configurar períodos</em>.
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tipo ou código..."
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {tiposQ.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: t.cor ?? "#94a3b8" }}
                      />
                      <p className="font-medium leading-tight">{t.nome}</p>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t.codigo}
                      </Badge>
                      {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                    {t.descricao && (
                      <p className="mt-1 text-xs text-muted-foreground">{t.descricao}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.exige_documento && (
                        <Badge variant="outline" className="text-[10px]">
                          Exige documento
                        </Badge>
                      )}
                      {t.permite_cid && (
                        <Badge variant="outline" className="text-[10px]">
                          Permite CID
                        </Badge>
                      )}
                      {t.permite_acidente && (
                        <Badge variant="outline" className="text-[10px]">
                          Acidente
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                      <Switch
                        checked={t.ativo}
                        disabled={!isAdmin || toggleAtivoMut.isPending}
                        onCheckedChange={() => toggleAtivoMut.mutate(t)}
                        aria-label="Ativo"
                      />
                      <span className="text-xs text-muted-foreground">Ativo</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isAdmin}
                      onClick={() => setConfiguring(t)}
                    >
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                      Configurar períodos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isAdmin}
                      onClick={() => setEditing(t)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum tipo encontrado.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {!isAdmin && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Somente Super Admin pode alterar tipos e vínculos.
        </p>
      )}

      <EditarTipoDialog
        tipo={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["tipos_ausencia"] })}
      />
      <ConfigurarPeriodosSheet
        tipo={configuring}
        opcoes={opcoesQ.data ?? []}
        onClose={() => setConfiguring(null)}
      />
    </AppShell>
  );
}

/* ============= Editar Tipo ============= */

function EditarTipoDialog({
  tipo,
  onClose,
  onSaved,
}: {
  tipo: Tipo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState("#3b82f6");
  const [icone, setIcone] = useState("");
  const [ordem, setOrdem] = useState(0);
  const [exigeDoc, setExigeDoc] = useState(false);
  const [permiteCid, setPermiteCid] = useState(false);
  const [permiteAcid, setPermiteAcid] = useState(false);

  useMemo(() => {
    if (tipo) {
      setNome(tipo.nome);
      setDescricao(tipo.descricao ?? "");
      setCor(tipo.cor ?? "#3b82f6");
      setIcone(tipo.icone ?? "");
      setOrdem(tipo.ordem);
      setExigeDoc(tipo.exige_documento);
      setPermiteCid(tipo.permite_cid);
      setPermiteAcid(tipo.permite_acidente);
    }
  }, [tipo]);

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!tipo) return;
      const { error } = await supabase
        .from("tipos_ausencia" as never)
        .update({
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          cor: cor || null,
          icone: icone || null,
          ordem,
          exige_documento: exigeDoc,
          permite_cid: permiteCid,
          permite_acidente: permiteAcid,
        } as never)
        .eq("id", tipo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo atualizado.");
      onSaved();
      onClose();
    },
    onError: (e: unknown) =>
      toast.error("Não foi possível salvar.", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  return (
    <Dialog open={!!tipo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar tipo de ausência</DialogTitle>
          <DialogDescription>
            Código interno <span className="font-mono">{tipo?.codigo}</span> é imutável.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome de exibição</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Cor
            </Label>
            <div className="flex gap-2">
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border bg-background"
              />
              <Input value={cor} onChange={(e) => setCor(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Ícone (lucide)</Label>
            <Input
              value={icone}
              onChange={(e) => setIcone(e.target.value)}
              placeholder="Ex.: Stethoscope"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input
              type="number"
              value={ordem}
              onChange={(e) => setOrdem(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox checked={exigeDoc} onCheckedChange={(v) => setExigeDoc(!!v)} />
              Exige documento
            </label>
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox checked={permiteCid} onCheckedChange={(v) => setPermiteCid(!!v)} />
              Permite CID
            </label>
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox checked={permiteAcid} onCheckedChange={(v) => setPermiteAcid(!!v)} />
              Permite acidente
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>
            {salvarMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============= Configurar períodos ============= */

function ConfigurarPeriodosSheet({
  tipo,
  opcoes,
  onClose,
}: {
  tipo: Tipo | null;
  opcoes: Opcao[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const vinculosQ = useQuery({
    queryKey: ["tipo_opcoes", tipo?.id],
    enabled: !!tipo,
    queryFn: async (): Promise<Vinculo[]> => {
      const { data, error } = await supabase
        .from("tipo_ausencia_opcoes_periodo" as never)
        .select("*")
        .eq("tipo_ausencia_id", tipo!.id);
      if (error) throw error;
      return (data ?? []) as unknown as Vinculo[];
    },
  });

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  useMemo(() => {
    if (vinculosQ.data) {
      setSelecionadas(
        new Set(vinculosQ.data.filter((v) => v.ativo).map((v) => v.opcao_periodo_id)),
      );
    }
  }, [vinculosQ.data]);

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!tipo) return;
      const existentes = new Map(
        (vinculosQ.data ?? []).map((v) => [v.opcao_periodo_id, v] as const),
      );
      const toEnable: string[] = [];
      const toDisable: string[] = [];
      const toInsert: string[] = [];

      opcoes.forEach((o) => {
        const marcado = selecionadas.has(o.id);
        const existente = existentes.get(o.id);
        if (marcado && !existente) toInsert.push(o.id);
        else if (marcado && existente && !existente.ativo) toEnable.push(existente.id);
        else if (!marcado && existente && existente.ativo) toDisable.push(existente.id);
      });

      if (toInsert.length > 0) {
        const rows = toInsert.map((opcao_periodo_id) => ({
          tipo_ausencia_id: tipo.id,
          opcao_periodo_id,
          ativo: true,
        }));
        const { error } = await supabase
          .from("tipo_ausencia_opcoes_periodo" as never)
          .insert(rows as never);
        if (error) throw error;
      }
      if (toEnable.length > 0) {
        const { error } = await supabase
          .from("tipo_ausencia_opcoes_periodo" as never)
          .update({ ativo: true } as never)
          .in("id", toEnable);
        if (error) throw error;
      }
      if (toDisable.length > 0) {
        const { error } = await supabase
          .from("tipo_ausencia_opcoes_periodo" as never)
          .update({ ativo: false } as never)
          .in("id", toDisable);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Períodos atualizados.");
      qc.invalidateQueries({ queryKey: ["tipo_opcoes", tipo?.id] });
      qc.invalidateQueries({ queryKey: ["opcoes_por_tipo"] });
      onClose();
    },
    onError: (e: unknown) =>
      toast.error("Não foi possível salvar os períodos.", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  const toggle = (id: string) => {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <Sheet open={!!tipo} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{tipo?.nome}</SheetTitle>
          <SheetDescription>
            Marque quais opções de período são permitidas para este tipo. Combinações
            desmarcadas serão bloqueadas ao salvar uma ausência.
          </SheetDescription>
        </SheetHeader>

        <div className="my-6 space-y-1">
          {vinculosQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            opcoes
              .filter((o) => o.ativo)
              .map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center justify-between rounded-md border p-2.5 text-sm hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selecionadas.has(o.id)}
                      onCheckedChange={() => toggle(o.id)}
                    />
                    <span>{o.nome}</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {o.codigo}
                  </Badge>
                </label>
              ))
          )}
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>
            {salvarMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar vínculos
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
