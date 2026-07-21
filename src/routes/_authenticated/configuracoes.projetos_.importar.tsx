import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle,
  AlertTriangle, Sparkles, RotateCcw,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/lib/permissions";
import {
  previewProjetosImport, confirmProjetosImport,
  type ProjetoImportPreview, type ProjetoImportRow, type ProjetoImportAcao,
} from "@/lib/projetos.functions";
import { friendlyRbacError } from "@/lib/rbac/errors";

export const Route = createFileRoute("/_authenticated/configuracoes/projetos_/importar")({
  head: () => ({ meta: [{ title: "Importar Projetos · CRM MK9" }] }),
  component: ImportarProjetosPage,
});

type WizardStep = 1 | 2 | 3 | 4;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

const acaoLabel: Record<ProjetoImportAcao, string> = {
  CRIAR: "Criar",
  ATUALIZAR: "Atualizar",
  ATIVAR: "Ativar",
  DESATIVAR: "Desativar",
  SEM_ALTERACAO: "Sem alteração",
  ERRO: "Erro",
};
const acaoBadge: Record<ProjetoImportAcao, string> = {
  CRIAR: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  ATUALIZAR: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  ATIVAR: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  DESATIVAR: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  SEM_ALTERACAO: "bg-muted text-muted-foreground border-border",
  ERRO: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function baixarModelo() {
  const cab = ["cnpj_empresa", "codigo_projeto", "nome_projeto", "status",
    "descricao", "data_inicio", "data_fim", "observacoes"];
  const exemplo = ["12.345.678/0001-90", "ARMT", "Projeto Armazém", "ATIVO",
    "Operação logística", "2026-01-01", "", ""];
  const ws = XLSX.utils.aoa_to_sheet([cab, exemplo]);
  ws["!cols"] = cab.map((c) => ({ wch: Math.max(16, c.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projetos");

  const instr = [
    ["Importação de Projetos — CRM MK9"],
    [],
    ["Formatos aceitos: .xlsx e .csv (até 5 MB, máx. 2.000 linhas)."],
    ["Somente a aba 'Projetos' é lida; as demais são ignoradas."],
    [],
    ["Colunas obrigatórias:"],
    ["  • cnpj_empresa — CNPJ da empresa já cadastrada (com ou sem máscara)"],
    ["  • codigo_projeto — 2 a 10 caracteres (A-Z, 0-9)"],
    ["  • nome_projeto — texto até 120 caracteres"],
    ["  • status — ATIVO ou INATIVO"],
    [],
    ["Colunas opcionais:"],
    ["  • descricao — texto até 500 caracteres"],
    ["  • data_inicio — YYYY-MM-DD (ou DD/MM/YYYY)"],
    ["  • data_fim — YYYY-MM-DD (ou DD/MM/YYYY)"],
    ["  • observacoes — texto livre (até 2000 caracteres)"],
    [],
    ["Regras de importação:"],
    ["  • A empresa é sempre localizada pelo CNPJ (nunca por nome)."],
    ["  • Empresas NÃO são criadas automaticamente."],
    ["  • Se o CNPJ não existir ou estiver fora do seu escopo, a linha vira ERRO."],
    ["  • Chave lógica do projeto: empresa + codigo_projeto (único por empresa)."],
    ["  • Se o projeto não existir, será CRIADO."],
    ["  • Se existir, será ATUALIZADO / ATIVADO / DESATIVADO conforme o status."],
    [],
    ["Projetos NÃO são excluídos por esta importação."],
    ["Para encerrar um projeto, informe status = INATIVO."],
    [],
    ["Segurança:"],
    ["  • A importação exige as permissões 'projeto.criar' e/ou 'projeto.editar'."],
    ["  • Cada operação gera trilha de auditoria com correlation_id."],
    ["  • Códigos de projeto com ausências registradas não são alterados."],
  ];
  const wsI = XLSX.utils.aoa_to_sheet(instr);
  wsI["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsI, "Instruções");
  XLSX.writeFile(wb, "modelo_importacao_projetos.xlsx");
}

function ImportarProjetosPage() {
  const navigate = useNavigate();
  const { has, loading: permLoading } = usePermissions();
  const canImport = has("projeto.criar") || has("projeto.editar");

  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [parsedRows, setParsedRows] = useState<ProjetoImportRow[]>([]);
  const [preview, setPreview] = useState<ProjetoImportPreview | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof confirmProjetosImport>> | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [conflict, setConflict] = useState<{
    code: "IMPORT_CONFLICT" | "IMPORT_CONCURRENT_CHANGE" | "IMPORT_TEMPORARILY_UNAVAILABLE" | "IMPORT_FAILED";
    message: string;
    correlationId?: string;
    hint?: { row_number?: number; codigo_projeto?: string; cnpj_empresa?: string };
  } | null>(null);
  const [revalidating, setRevalidating] = useState(false);

  function reset() {
    setStep(1);
    setFile(null);
    setParsedRows([]);
    setPreview(null);
    setResult(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function processFile(f: File) {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast.error("Formato inválido. Use .xlsx ou .csv");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Arquivo maior que 5 MB.");
      return;
    }
    setFile({ name: f.name, size: f.size });
    setStep(2);
    setProgress(20);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "projetos") ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
      const norm = raw
        .map((r, i) => ({
          linha: i + 2,
          cnpj_empresa: String(r["cnpj_empresa"] ?? r["CNPJ"] ?? r["cnpj"] ?? "").trim(),
          codigo_projeto: String(r["codigo_projeto"] ?? r["codigo"] ?? "").trim(),
          nome_projeto: String(r["nome_projeto"] ?? r["nome"] ?? "").trim(),
          status: String(r["status"] ?? "").trim(),
          descricao: String(r["descricao"] ?? "").trim() || null,
          data_inicio: String(r["data_inicio"] ?? "").trim() || null,
          data_fim: String(r["data_fim"] ?? "").trim() || null,
          observacoes: String(r["observacoes"] ?? "").trim() || null,
        }))
        .filter((r) => r.cnpj_empresa || r.codigo_projeto || r.nome_projeto || r.status);
      if (norm.length === 0) {
        toast.error("A planilha não contém linhas de dados.");
        setStep(1);
        return;
      }
      if (norm.length > MAX_ROWS) {
        toast.error(`Máximo de ${MAX_ROWS} linhas por arquivo.`);
        setStep(1);
        return;
      }
      setParsedRows(norm);
      setProgress(60);
      const prev = await previewProjetosImport({ data: {
        arquivo_nome: f.name,
        arquivo_tamanho: f.size,
        rows: norm,
      } });
      setPreview(prev);
      setProgress(100);
      setStep(3);
    } catch (err) {
      const f2 = friendlyRbacError(err);
      toast.error(f2.title, { description: f2.description });
      setStep(1);
      setProgress(0);
    }
  }

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!preview || !file) throw new Error("Nada para confirmar.");
      return await confirmProjetosImport({ data: {
        arquivo_nome: file.name,
        arquivo_tamanho: file.size,
        rows: parsedRows,
        correlation_id: preview.correlation_id,
      } });
    },
    onSuccess: (r) => {
      setResult(r);
      setStep(4);
      toast.success("Importação concluída.");
    },
    onError: (e) => {
      const f = friendlyRbacError(e);
      toast.error(f.title, { description: f.description });
    },
  });

  const podeConfirmar = preview && preview.erro === 0 && (preview.criar + preview.atualizar + preview.ativar + preview.desativar) > 0;

  function baixarRelatorioErros() {
    if (!preview) return;
    const rows = preview.linhas
      .filter((l) => l.erros.length > 0)
      .map((l) => ({
        linha: l.linha,
        cnpj: l.cnpj_original,
        codigo: l.codigo_normalizado,
        problema: l.erros.join("; "),
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Erros");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(0, 12);
    XLSX.writeFile(wb, `erros_importacao_projetos_${stamp}.xlsx`);
  }

  const stepsMeta = useMemo(() => ([
    { n: 1, label: "Selecionar" },
    { n: 2, label: "Validar" },
    { n: 3, label: "Revisar" },
    { n: 4, label: "Confirmar" },
  ]), []);

  return (
    <AppShell title="Importar Projetos" breadcrumb={["Configurações", "Projetos", "Importar"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/configuracoes/projetos" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Projetos
        </Button>
        <Button variant="outline" onClick={baixarModelo}>
          <Download className="mr-2 h-4 w-4" /> Baixar modelo (.xlsx)
        </Button>
      </div>

      {!permLoading && !canImport && (
        <Alert variant="destructive">
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você precisa de <b>projeto.criar</b> ou <b>projeto.editar</b>.</AlertDescription>
        </Alert>
      )}

      {/* Stepper */}
      <Card className="p-4">
        <ol className="flex items-center justify-between gap-2">
          {stepsMeta.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li key={s.n} className="flex flex-1 items-center gap-2">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold
                  ${done ? "bg-emerald-500 text-white"
                    : active ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                </div>
                <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                {i < stepsMeta.length - 1 && (
                  <div className={`ml-2 hidden h-px flex-1 sm:block ${step > s.n ? "bg-emerald-500" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Etapa 1 — seleção */}
      {step === 1 && (
        <Card
          className={`border-2 border-dashed p-10 transition-colors ${dragActive ? "border-primary bg-primary/5" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragActive(false);
            const f = e.dataTransfer.files?.[0];
            if (f && canImport) void processFile(f);
          }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <FileSpreadsheet className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
              <p className="mt-1 text-xs text-muted-foreground">
                .xlsx ou .csv · até 5 MB · máx. 2.000 linhas · aba <b>Projetos</b>
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={!canImport}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void processFile(f);
              }}
            />
            <div className="flex gap-2">
              <Button disabled={!canImport} onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Selecionar arquivo
              </Button>
              <Button variant="outline" onClick={baixarModelo}>
                <Download className="mr-2 h-4 w-4" /> Baixar modelo
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Etapa 2 — validando */}
      {step === 2 && (
        <Card className="p-8">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
            <Sparkles className="h-8 w-8 animate-pulse text-primary" />
            <p className="font-medium">Lendo e validando "{file?.name}"…</p>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-muted-foreground">Normalizando CNPJs, localizando empresas, verificando duplicidades…</p>
          </div>
        </Card>
      )}

      {/* Etapa 3 — prévia */}
      {step === 3 && preview && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Total: <b className="ml-1">{preview.total}</b></Badge>
              <Badge className={acaoBadge.CRIAR}>Criar: {preview.criar}</Badge>
              <Badge className={acaoBadge.ATUALIZAR}>Atualizar: {preview.atualizar}</Badge>
              <Badge className={acaoBadge.ATIVAR}>Ativar: {preview.ativar}</Badge>
              <Badge className={acaoBadge.DESATIVAR}>Desativar: {preview.desativar}</Badge>
              <Badge className={acaoBadge.SEM_ALTERACAO}>Sem alteração: {preview.sem_alteracao}</Badge>
              <Badge className={acaoBadge.ERRO}>Erros: {preview.erro}</Badge>
              <Badge variant="outline">Empresas: {preview.empresas_envolvidas}</Badge>
              <div className="ml-auto flex gap-2">
                {preview.erro > 0 && (
                  <Button variant="outline" onClick={baixarRelatorioErros}>
                    <Download className="mr-2 h-4 w-4" /> Baixar erros
                  </Button>
                )}
                <Button variant="ghost" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Trocar arquivo
                </Button>
                <Button
                  disabled={!podeConfirmar || confirmMut.isPending || !canImport}
                  onClick={() => confirmMut.mutate()}
                >
                  {confirmMut.isPending ? "Confirmando…" : "Confirmar importação"}
                </Button>
              </div>
            </div>
            {preview.erro > 0 && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Existem linhas com erro</AlertTitle>
                <AlertDescription>
                  Corrija a planilha e envie novamente. A importação só é confirmada com <b>0 erros</b>.
                </AlertDescription>
              </Alert>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-14">#</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.linhas.map((l) => (
                    <TableRow key={l.linha} className={l.acao === "ERRO" ? "bg-red-500/5" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{l.linha}</TableCell>
                      <TableCell className="font-mono text-xs">{l.cnpj_original || "—"}</TableCell>
                      <TableCell className="text-sm">{l.empresa_nome ?? <span className="italic text-muted-foreground">não encontrada</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{l.codigo_normalizado || "—"}</TableCell>
                      <TableCell className="text-sm">{l.nome_projeto || "—"}</TableCell>
                      <TableCell>
                        {l.status_normalizado ? (
                          <Badge variant="outline">{l.status_normalizado}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={acaoBadge[l.acao]}>{acaoLabel[l.acao]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.erros.length > 0 ? l.erros.join("; ") : "OK"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {/* Etapa 4 — resultado */}
      {step === 4 && result && (
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-lg font-semibold">Importação finalizada</p>
                <p className="text-xs text-muted-foreground">Correlation: <span className="font-mono">{result.correlation_id}</span></p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Metric label="Total" value={result.total} />
              <Metric label="Criadas" value={result.criadas} tone="blue" />
              <Metric label="Atualizadas" value={result.atualizadas} tone="indigo" />
              <Metric label="Ativadas" value={result.ativadas} tone="emerald" />
              <Metric label="Desativadas" value={result.desativadas} tone="amber" />
              <Metric label="Falhas" value={result.falhas.length} tone={result.falhas.length ? "red" : undefined} />
            </div>
            {result.falhas.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Algumas linhas não foram aplicadas</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {result.falhas.slice(0, 10).map((f) => (
                      <li key={f.linha}>Linha {f.linha}: {f.erro}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/configuracoes/projetos">Ver projetos</Link>
              </Button>
              <Button variant="outline" onClick={reset}>
                <Upload className="mr-2 h-4 w-4" /> Nova importação
              </Button>
            </div>
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "blue" | "indigo" | "emerald" | "amber" | "red" }) {
  const toneCls =
    tone === "blue" ? "text-blue-600 dark:text-blue-400" :
    tone === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "amber" ? "text-amber-600 dark:text-amber-400" :
    tone === "red" ? "text-red-600 dark:text-red-400" :
    "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}
