import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, RefreshCw, ScrollText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaPage,
});

type Row = {
  total: number;
  id: string;
  created_at: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  perfil: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  modulo: string;
  registro_id: string | null;
  acao: string;
  entidade: string | null;
  sucesso: boolean;
  ip: string | null;
  origem: string | null;
};

const MODULOS = ["empresas", "projetos", "colaboradores", "ausencias", "comunicacoes", "importacoes", "auth", "exportacoes", "downloads", "lancamentos", "painel_rh"];
const ACOES = ["CREATE", "UPDATE", "DELETE_LOGICO", "LOGIN", "LOGOUT", "IMPORTACAO", "EXPORTACAO", "DOWNLOAD", "VISUALIZACAO", "ENVIO_COMUNICACAO", "LANCAMENTO", "ACESSO_NEGADO", "MUDANCA_STATUS"];
const PERFIS = ["super_admin", "compliance", "rh", "supervisor"];

const acaoColor: Record<string, string> = {
  CREATE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  UPDATE: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  DELETE_LOGICO: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  LOGIN: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  LOGOUT: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
  IMPORTACAO: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  EXPORTACAO: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  DOWNLOAD: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  VISUALIZACAO: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  ENVIO_COMUNICACAO: "bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/30",
  LANCAMENTO: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  ACESSO_NEGADO: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  MUDANCA_STATUS: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
};

const PAGE_SIZE = 50;

function AuditoriaPage() {
  const [filters, setFilters] = useState({
    inicio: "",
    fim: "",
    perfil: "",
    modulo: "",
    acao: "",
    sucesso: "",
    busca: "",
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const kpisQ = useQuery({
    queryKey: ["audit-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("audit_kpis", { _inicio: new Date(Date.now() - 24 * 3600 * 1000).toISOString() } as never);
      if (error) throw error;
      return data as unknown as { logins: number; logouts: number; exportacoes: number; downloads: number; negados: number; falhas: number };
    },
    refetchInterval: 60_000,
  });

  const listQ = useQuery({
    queryKey: ["audit-list", filters, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_audit_logs", {
        _inicio: filters.inicio ? new Date(filters.inicio).toISOString() : null,
        _fim: filters.fim ? new Date(filters.fim).toISOString() : null,
        _perfil: filters.perfil || null,
        _modulo: filters.modulo || null,
        _acao: (filters.acao || null) as never,
        _sucesso: filters.sucesso === "" ? null : filters.sucesso === "true",
        _busca: filters.busca || null,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const total = listQ.data?.[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  const detailQ = useQuery({
    queryKey: ["audit-detail", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("*").eq("id", selected!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function logExport(kind: string) {
    await supabase.rpc("log_audit_event", {
      _modulo: "exportacoes",
      _acao: "EXPORTACAO",
      _entidade: "Auditoria",
      _observacoes: `Formato: ${kind}`,
      _origem: "auditoria",
    } as never);
  }

  async function exportXLSX() {
    if (!listQ.data?.length) return;
    const rows = listQ.data.map((r) => ({
      Data: new Date(r.created_at).toLocaleString("pt-BR"),
      Usuario: r.usuario_nome, Perfil: r.perfil, Modulo: r.modulo,
      Acao: r.acao, Entidade: r.entidade, Registro: r.registro_id,
      Empresa: r.empresa_nome, Projeto: r.projeto_nome,
      Sucesso: r.sucesso ? "Sim" : "Não", IP: r.ip, Origem: r.origem,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, `auditoria-${Date.now()}.xlsx`);
    await logExport("xlsx"); toast.success("Exportado.");
  }
  async function exportCSV() {
    if (!listQ.data?.length) return;
    const ws = XLSX.utils.json_to_sheet(listQ.data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `auditoria-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    await logExport("csv"); toast.success("Exportado.");
  }
  async function exportPDF() {
    if (!listQ.data?.length) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14); doc.text("Auditoria — MK9", 14, 14);
    doc.setFontSize(9);
    let y = 24;
    doc.text("Data | Usuário | Módulo | Ação | Entidade | Empresa | Sucesso", 14, y);
    y += 6;
    listQ.data.slice(0, 60).forEach((r) => {
      const line = `${new Date(r.created_at).toLocaleString("pt-BR")} | ${r.usuario_nome ?? "-"} | ${r.modulo} | ${r.acao} | ${r.entidade ?? "-"} | ${r.empresa_nome ?? "-"} | ${r.sucesso ? "OK" : "FAIL"}`;
      doc.text(line.substring(0, 160), 14, y); y += 5;
      if (y > 190) { doc.addPage(); y = 14; }
    });
    doc.save(`auditoria-${Date.now()}.pdf`);
    await logExport("pdf"); toast.success("Exportado.");
  }

  const diff = useMemo(() => {
    const d = detailQ.data as { antes?: Record<string, unknown> | null; depois?: Record<string, unknown> | null } | null | undefined;
    if (!d) return null;
    const antes = (d.antes ?? {}) as Record<string, unknown>;
    const depois = (d.depois ?? {}) as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)])).sort();
    return keys.map((k) => ({ key: k, antes: antes[k], depois: depois[k], changed: JSON.stringify(antes[k]) !== JSON.stringify(depois[k]) }));
  }, [detailQ.data]);

  const kpi = kpisQ.data;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Auditoria e Governança</h1>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Logins 24h", value: kpi?.logins ?? 0, tone: "text-cyan-600" },
          { label: "Logouts 24h", value: kpi?.logouts ?? 0, tone: "text-slate-600" },
          { label: "Exportações 24h", value: kpi?.exportacoes ?? 0, tone: "text-amber-600" },
          { label: "Downloads 24h", value: kpi?.downloads ?? 0, tone: "text-indigo-600" },
          { label: "Acessos negados", value: kpi?.negados ?? 0, tone: "text-rose-600" },
          { label: "Falhas", value: kpi?.falhas ?? 0, tone: "text-red-600" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className={`text-2xl font-semibold ${k.tone}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><Label>Início</Label><Input type="datetime-local" value={filters.inicio} onChange={(e) => setFilters({ ...filters, inicio: e.target.value })} /></div>
          <div><Label>Fim</Label><Input type="datetime-local" value={filters.fim} onChange={(e) => setFilters({ ...filters, fim: e.target.value })} /></div>
          <div>
            <Label>Perfil</Label>
            <Select value={filters.perfil || "all"} onValueChange={(v) => setFilters({ ...filters, perfil: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {PERFIS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Módulo</Label>
            <Select value={filters.modulo || "all"} onValueChange={(v) => setFilters({ ...filters, modulo: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MODULOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ação</Label>
            <Select value={filters.acao || "all"} onValueChange={(v) => setFilters({ ...filters, acao: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {ACOES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resultado</Label>
            <Select value={filters.sucesso === "" ? "all" : filters.sucesso} onValueChange={(v) => setFilters({ ...filters, sucesso: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Sucesso</SelectItem>
                <SelectItem value="false">Falha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Busca</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input placeholder="Nome, matrícula, ID, texto..." className="pl-8" value={filters.busca} onChange={(e) => setFilters({ ...filters, busca: e.target.value })} />
            </div>
          </div>
          <div className="md:col-span-4 flex flex-wrap gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setFilters({ inicio: "", fim: "", perfil: "", modulo: "", acao: "", sucesso: "", busca: "" }); setPage(0); }}>Limpar</Button>
            <Button variant="outline" onClick={() => { listQ.refetch(); kpisQ.refetch(); }}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button>
            <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
            <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" />CSV</Button>
            <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 mr-1" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Eventos ({Number(total)})</CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span>Página {page + 1} de {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.isLoading && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!listQ.isLoading && !listQ.data?.length && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum evento.</TableCell></TableRow>}
              {listQ.data?.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{r.usuario_nome ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{r.perfil ?? "—"}</Badge></TableCell>
                  <TableCell>{r.modulo}</TableCell>
                  <TableCell><Badge className={acaoColor[r.acao] ?? ""} variant="outline">{r.acao}</Badge></TableCell>
                  <TableCell>{r.entidade ?? "—"}</TableCell>
                  <TableCell>{r.empresa_nome ?? "—"}</TableCell>
                  <TableCell>{r.projeto_nome ?? "—"}</TableCell>
                  <TableCell>{r.sucesso ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" variant="outline">OK</Badge> : <Badge variant="destructive">FALHA</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>Detalhes do evento</SheetTitle></SheetHeader>
          {detailQ.data && (() => {
            const d = detailQ.data as Record<string, unknown>;
            const created = d.created_at as string;
            return (
              <div className="space-y-4 py-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Usuário" value={String(d.usuario_nome ?? "—")} />
                  <Field label="Perfil" value={String(d.perfil ?? "—")} />
                  <Field label="Data/Hora" value={new Date(created).toLocaleString("pt-BR")} />
                  <Field label="Módulo" value={String(d.modulo)} />
                  <Field label="Ação" value={String(d.acao)} />
                  <Field label="Entidade" value={String(d.entidade ?? "—")} />
                  <Field label="Registro" value={String(d.registro_id ?? "—")} />
                  <Field label="Origem" value={String(d.origem ?? "—")} />
                  <Field label="IP" value={String(d.ip ?? "—")} />
                  <Field label="Sucesso" value={d.sucesso ? "Sim" : "Não"} />
                </div>
                {d.user_agent ? <Field label="User Agent" value={String(d.user_agent)} /> : null}
                {d.observacoes ? <Field label="Observações" value={String(d.observacoes)} /> : null}

                <div>
                  <div className="font-semibold mb-2">Comparação Antes / Depois</div>
                  <div className="border rounded-md overflow-hidden">
                    <div className="grid grid-cols-3 bg-muted/60 text-xs font-medium px-3 py-2">
                      <div>Campo</div><div>Antes</div><div>Depois</div>
                    </div>
                    <div className="divide-y max-h-96 overflow-y-auto">
                      {(diff ?? []).map((row) => (
                        <div key={row.key} className={`grid grid-cols-3 px-3 py-2 text-xs ${row.changed ? "bg-amber-500/10" : ""}`}>
                          <div className="font-medium">{row.key}</div>
                          <div className="break-all text-muted-foreground">{fmt(row.antes)}</div>
                          <div className={`break-all ${row.changed ? "font-semibold" : "text-muted-foreground"}`}>{fmt(row.depois)}</div>
                        </div>
                      ))}
                      {(!diff || diff.length === 0) && <div className="px-3 py-4 text-xs text-muted-foreground">Sem dados de comparação.</div>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm break-all">{value}</div>
    </div>
  );
}
function fmt(v: unknown) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
