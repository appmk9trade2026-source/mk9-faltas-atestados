import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import {
  auditarHistoricoSenhas,
  listarRedefinicoesSenha,
  type RedefinicaoSenhaRow,
} from "@/lib/senha-redefinicoes.functions";

export const Route = createFileRoute("/_authenticated/administracao/historico-senhas")({
  component: HistoricoSenhasPage,
  head: () => ({
    meta: [
      { title: "Histórico de Redefinições de Senha | MK9 Trade" },
      {
        name: "description",
        content:
          "Auditoria das redefinições de senha temporária realizadas por administradores no CRM MK9, sem exposição de credenciais.",
      },
      { property: "og:title", content: "Histórico de Redefinições de Senha | MK9 Trade" },
      {
        property: "og:description",
        content: "Consulta administrativa e auditável das redefinições de senha temporária do CRM MK9.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 25;

const PERFIL_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  compliance: "Administrador",
  rh: "RH",
  coordenador: "Coordenador",
  supervisor: "Supervisor",
  operacao: "Operação",
  visualizador: "Visualizador",
};

function fmtData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function HistoricoSenhasPage() {
  const { roles, loading: sessionLoading } = useSession();
  const autorizado = roles.includes("super_admin") || roles.includes("compliance");

  const [filtros, setFiltros] = useState({
    inicio: "",
    fim: "",
    usuario: "",
    responsavel: "",
    empresa: "",
    perfil: "",
    busca: "",
  });
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [page, setPage] = useState(0);

  const listar = useServerFn(listarRedefinicoesSenha);
  const auditar = useServerFn(auditarHistoricoSenhas);
  const aberturaRegistrada = useRef(false);

  const q = useQuery({
    queryKey: ["historico-redefinicoes", filtros.inicio, filtros.fim],
    queryFn: () => listar({ data: { inicio: filtros.inicio || null, fim: filtros.fim || null, limite: 1000 } }),
    enabled: autorizado,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!autorizado || aberturaRegistrada.current) return;
    aberturaRegistrada.current = true;
    auditar({ data: { evento: "ABERTURA" } }).catch(() => {});
  }, [autorizado, auditar]);

  const rows: RedefinicaoSenhaRow[] = useMemo(() => q.data ?? [], [q.data]);

  const filtradas = useMemo(() => {
    const t = (v: string) => v.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtros.usuario && !`${r.usuario_nome ?? ""} ${r.usuario_email ?? ""}`.toLowerCase().includes(t(filtros.usuario)))
        return false;
      if (filtros.responsavel && !(r.responsavel_nome ?? "").toLowerCase().includes(t(filtros.responsavel))) return false;
      if (filtros.empresa && !r.usuario_empresas.join(" ").toLowerCase().includes(t(filtros.empresa))) return false;
      if (filtros.perfil && !r.usuario_perfis.some((p) => p.toLowerCase().includes(t(filtros.perfil)))) return false;
      if (filtros.busca) {
        const alvo = [
          r.usuario_nome,
          r.usuario_email,
          r.responsavel_nome,
          r.justificativa,
          r.usuario_empresas.join(" "),
          r.usuario_perfis.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(t(filtros.busca))) return false;
      }
      return true;
    });
  }, [rows, filtros]);

  const kpis = useMemo(() => {
    const agora = Date.now();
    const dia = 86_400_000;
    const hojeStr = new Date().toDateString();
    const porAdmin = new Map<string, number>();
    let hoje = 0;
    let d7 = 0;
    let d30 = 0;
    for (const r of filtradas) {
      const d = new Date(r.created_at);
      if (d.toDateString() === hojeStr) hoje++;
      if (agora - d.getTime() <= 7 * dia) d7++;
      if (agora - d.getTime() <= 30 * dia) d30++;
      const nome = r.responsavel_nome ?? "—";
      porAdmin.set(nome, (porAdmin.get(nome) ?? 0) + 1);
    }
    return {
      total: filtradas.length,
      hoje,
      d7,
      d30,
      porAdmin: [...porAdmin.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [filtradas]);

  const paginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pagina = filtradas.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function linhasExport() {
    return filtradas.map((r) => ({
      "Data/Hora": fmtData(r.created_at),
      Usuário: r.usuario_nome ?? "—",
      "E-mail de acesso": r.usuario_email ?? "—",
      Perfil: r.usuario_perfis.map((p) => PERFIL_LABEL[p] ?? p).join(", ") || "—",
      Empresa: r.usuario_empresas.join(", ") || "—",
      Responsável: r.responsavel_nome ?? "—",
      Justificativa: r.justificativa ?? "—",
      Status: r.sucesso ? (r.padrao ? "Senha padrão redefinida" : "Redefinida") : "Falhou",
    }));
  }

  async function registrarExport(formato: "csv" | "xlsx" | "pdf") {
    await auditar({
      data: {
        evento: "EXPORTACAO",
        formato,
        total: filtradas.length,
        filtros: Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) as Record<string, string>,
      },
    }).catch(() => {});
  }

  async function exportCSV() {
    const ws = XLSX.utils.json_to_sheet(linhasExport());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `redefinicoes-senha-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await registrarExport("csv");
    toast.success("CSV exportado.");
  }

  async function exportXLSX() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasExport()), "Redefinições");
    XLSX.writeFile(wb, `redefinicoes-senha-${Date.now()}.xlsx`);
    await registrarExport("xlsx");
    toast.success("Excel exportado.");
  }

  async function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(13);
    doc.text("Histórico de Redefinições de Senha Temporária — MK9 Trade", 14, 14);
    doc.setFontSize(8);
    let y = 24;
    for (const l of linhasExport()) {
      const linha = `${l["Data/Hora"]} | ${l.Usuário} | ${l["E-mail de acesso"]} | ${l.Perfil} | ${l.Empresa} | ${l.Responsável} | ${l.Status}`;
      doc.text(linha.slice(0, 200), 14, y);
      y += 5;
      if (y > 195) {
        doc.addPage();
        y = 20;
      }
    }
    doc.save(`redefinicoes-senha-${Date.now()}.pdf`);
    await registrarExport("pdf");
    toast.success("PDF exportado.");
  }

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!autorizado) {
    return (
      <Card className="m-4 border-destructive/40">
        <CardContent className="flex items-center gap-3 p-6">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">
              Somente Super Admin e Administrador podem consultar o histórico de redefinições de senha.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Histórico de Redefinições de Senha</h1>
            <p className="text-sm text-muted-foreground">
              Consulta somente leitura. Nenhuma senha, hash ou token é exibido.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-1 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={!filtradas.length}>
            <Download className="mr-1 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={exportXLSX} disabled={!filtradas.length}>
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={!filtradas.length}>
            <FileText className="mr-1 h-4 w-4" />
            PDF
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total de redefinições", valor: kpis.total },
          { label: "Hoje", valor: kpis.hoje },
          { label: "Últimos 7 dias", valor: kpis.d7 },
          { label: "Últimos 30 dias", valor: kpis.d30 },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{k.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {kpis.porAdmin.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por administrador</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pb-4">
            {kpis.porAdmin.map(([nome, n]) => (
              <Badge key={nome} variant="secondary" className="font-normal">
                {nome} · {n}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <button
          type="button"
          className="flex w-full items-center gap-2 p-4 text-left"
          onClick={() => setFiltrosAbertos((v) => !v)}
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Filtros</span>
          {filtrosAbertos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {filtrosAbertos && (
          <CardContent className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["inicio", "Início", "date"],
                ["fim", "Fim", "date"],
                ["usuario", "Usuário afetado", "text"],
                ["responsavel", "Administrador responsável", "text"],
                ["empresa", "Empresa", "text"],
                ["perfil", "Perfil", "text"],
                ["busca", "Texto livre", "text"],
              ] as const
            ).map(([campo, label, tipo]) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`f-${campo}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`f-${campo}`}
                  type={tipo}
                  value={filtros[campo]}
                  onChange={(e) => {
                    setPage(0);
                    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
                  }}
                  onBlur={(e) => {
                    if (e.target.value) {
                      auditar({ data: { evento: "FILTRO", filtros: { campo, valor: e.target.value } } }).catch(() => {});
                    }
                  }}
                />
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail de acesso</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="min-w-[240px]">Justificativa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!q.isLoading && pagina.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Nenhuma redefinição encontrada para os filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
                {pagina.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">{fmtData(r.created_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{r.usuario_nome ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.usuario_email ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.usuario_perfis.length
                        ? r.usuario_perfis.map((p) => (
                            <Badge key={p} variant="outline" className="mr-1 text-[10px] font-normal">
                              {PERFIL_LABEL[p] ?? p}
                            </Badge>
                          ))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.usuario_empresas.join(", ") || "—"}</TableCell>
                    <TableCell className="text-sm">{r.responsavel_nome ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.justificativa ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.sucesso ? "secondary" : "destructive"} className="text-[10px] font-normal">
                        {r.sucesso ? (r.padrao ? "Senha padrão" : "Redefinida") : "Falhou"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
            <span>
              {filtradas.length} registro(s) · página {page + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= paginas}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
