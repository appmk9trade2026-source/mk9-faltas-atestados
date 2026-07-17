import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Upload,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/colaboradores_/importar")({
  component: ImportarPage,
});

const COLUNAS = [
  "Matrícula",
  "Nome Completo",
  "Projeto",
  "Empresa",
  "Telefone do Colaborador",
  "WhatsApp",
  "Email",
  "Supervisor(a)",
  "Telefone do Supervisor",
  "Email Supervisor",
] as const;

type RowStatus = "OK" | "ERRO" | "DUPLICADA";
type ParsedRow = {
  linha: number;
  matricula: string;
  nome_completo: string;
  projeto: string;
  empresa: string;
  telefone: string;
  whatsapp: string;
  email: string;
  supervisor_nome: string;
  supervisor_telefone: string;
  supervisor_email: string;
  status: RowStatus;
  mensagem: string;
};

const digitsOnly = (v: string) => v.replace(/\D+/g, "");
const isValidEmail = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const norm = (v: unknown) => String(v ?? "").trim();

function ImportarPage() {
  const navigate = useNavigate();
  const { roles } = useSession();
  const canImport = roles.includes("super_admin") || roles.includes("rh");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [atualizar, setAtualizar] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultado, setResultado] = useState<{
    total: number;
    importadas: number;
    atualizadas: number;
    ignoradas: number;
    erros: number;
    ms: number;
  } | null>(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id,nome,ativo");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projetos").select("id,nome,empresa_id,ativo");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: existentes = [] } = useQuery({
    queryKey: ["colab-matriculas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaboradores").select("empresa_id,matricula");
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.status === "OK").length;
    const err = rows.filter((r) => r.status === "ERRO").length;
    const dup = rows.filter((r) => r.status === "DUPLICADA").length;
    return { total: rows.length, ok, err, dup };
  }, [rows]);

  function baixarModelo() {
    const ws = XLSX.utils.aoa_to_sheet([COLUNAS as unknown as string[]]);
    ws["!cols"] = COLUNAS.map(() => ({ wch: 24 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    XLSX.writeFile(wb, "modelo-colaboradores.xlsx");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Arquivo maior que 20MB.");
      return;
    }
    setResultado(null);
    setFileName(f.name);
    setFileSize(f.size);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });
      const parsed = validar(raw);
      setRows(parsed);
      toast.success(`Planilha carregada: ${parsed.length} linha(s).`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível ler o arquivo.");
    }
  }

  function validar(raw: Record<string, unknown>[]): ParsedRow[] {
    const empresaByName = new Map(
      empresas.map((e) => [e.nome.toLowerCase(), e]),
    );
    const projetoByEmpNome = new Map(
      projetos.map((p) => [`${p.empresa_id}::${p.nome.toLowerCase()}`, p]),
    );
    const matriculasBanco = new Set(
      existentes.map((c) => `${c.empresa_id}::${c.matricula}`),
    );
    const matriculasArquivo = new Set<string>();

    return raw
      .map((r, idx) => {
        const linha = idx + 2;
        const matricula = digitsOnly(norm(r["Matrícula"] ?? r["Matricula"])) || norm(r["Matrícula"] ?? r["Matricula"]);
        const nome_completo = norm(r["Nome Completo"]);
        const projeto = norm(r["Projeto"]);
        const empresa = norm(r["Empresa"]);
        const telefone = digitsOnly(norm(r["Telefone do Colaborador"]));
        const whatsapp = digitsOnly(norm(r["WhatsApp"]));
        const email = norm(r["Email"]).toLowerCase();
        const supervisor_nome = norm(r["Supervisor(a)"] ?? r["Supervisor"]);
        const supervisor_telefone = digitsOnly(norm(r["Telefone do Supervisor"]));
        const supervisor_email = norm(r["Email Supervisor"]).toLowerCase();

        const vazia = ![matricula, nome_completo, projeto, empresa, telefone, whatsapp, email, supervisor_nome].some(
          (v) => v && v.length > 0,
        );
        if (vazia) return null;

        let status: RowStatus = "OK";
        const msgs: string[] = [];

        if (!matricula) msgs.push("Matrícula obrigatória");
        if (!nome_completo) msgs.push("Nome obrigatório");
        if (!empresa) msgs.push("Empresa obrigatória");
        if (!projeto) msgs.push("Projeto obrigatório");
        if (email && !isValidEmail(email)) msgs.push("E-mail inválido");
        if (supervisor_email && !isValidEmail(supervisor_email)) msgs.push("E-mail do supervisor inválido");
        if (telefone && (telefone.length < 10 || telefone.length > 13)) msgs.push("Telefone inválido");
        if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) msgs.push("WhatsApp inválido");

        const emp = empresa ? empresaByName.get(empresa.toLowerCase()) : undefined;
        if (empresa && !emp) msgs.push("Empresa inexistente");
        else if (emp && !emp.ativo) msgs.push("Empresa inativa");

        let proj: { id: string; ativo: boolean; empresa_id: string } | undefined;
        if (emp && projeto) {
          proj = projetoByEmpNome.get(`${emp.id}::${projeto.toLowerCase()}`);
          if (!proj) msgs.push("Projeto não pertence à empresa (ou inexistente)");
          else if (!proj.ativo) msgs.push("Projeto inativo");
        }

        if (emp && matricula) {
          const key = `${emp.id}::${matricula}`;
          if (matriculasArquivo.has(key)) msgs.push("Matrícula duplicada no arquivo");
          matriculasArquivo.add(key);
          if (matriculasBanco.has(key)) {
            status = "DUPLICADA";
          }
        }

        if (msgs.length > 0) status = "ERRO";

        return {
          linha,
          matricula,
          nome_completo,
          projeto,
          empresa,
          telefone,
          whatsapp,
          email,
          supervisor_nome,
          supervisor_telefone,
          supervisor_email,
          status,
          mensagem: msgs.length ? msgs.join("; ") : status === "DUPLICADA" ? "Já existe (atualizar ou ignorar)" : "OK",
        } as ParsedRow;
      })
      .filter((r): r is ParsedRow => r !== null);
  }

  const importar = useMutation({
    mutationFn: async () => {
      const t0 = performance.now();
      const elegiveis = rows.filter((r) => r.status === "OK" || (r.status === "DUPLICADA" && atualizar));
      if (elegiveis.length === 0) throw new Error("Nenhuma linha válida para importar.");

      const chunkSize = 250;
      let inseridas = 0, atualizadas = 0, ignoradas = 0, erros = 0;
      const detalhes: Array<{ linha: string | number; erro: string }> = [];

      for (let i = 0; i < elegiveis.length; i += chunkSize) {
        const slice = elegiveis.slice(i, i + chunkSize).map((r) => ({
          linha: r.linha,
          matricula: r.matricula,
          nome_completo: r.nome_completo,
          empresa: r.empresa,
          projeto: r.projeto,
          telefone: r.telefone,
          whatsapp: r.whatsapp,
          email: r.email,
          supervisor_nome: r.supervisor_nome,
          supervisor_telefone: r.supervisor_telefone,
          supervisor_email: r.supervisor_email,
        }));
        const { data, error } = await supabase.rpc("import_colaboradores_bulk", {
          _rows: slice,
          _atualizar: atualizar,
        });
        if (error) throw error;
        const r = data as { inseridas: number; atualizadas: number; ignoradas: number; erros: number; detalhes: unknown[] };
        inseridas += r.inseridas ?? 0;
        atualizadas += r.atualizadas ?? 0;
        ignoradas += r.ignoradas ?? 0;
        erros += r.erros ?? 0;
        if (Array.isArray(r.detalhes)) detalhes.push(...(r.detalhes as Array<{ linha: string | number; erro: string }>));
        setProgress(Math.round(((i + slice.length) / elegiveis.length) * 100));
      }

      const invalidas = rows.filter((r) => r.status === "ERRO").length;
      const ignoradasTotal = ignoradas + invalidas + (atualizar ? 0 : rows.filter((r) => r.status === "DUPLICADA").length);
      const ms = Math.round(performance.now() - t0);

      const detalhesInvalidos = rows
        .filter((r) => r.status === "ERRO")
        .map((r) => ({ linha: r.linha, erro: r.mensagem }));

      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("importacoes").insert({
        arquivo_nome: fileName,
        arquivo_tamanho: fileSize,
        usuario_id: userData.user?.id as string,
        total_linhas: rows.length,
        importadas: inseridas + atualizadas,
        atualizadas,
        ignoradas: ignoradasTotal,
        erros: erros + invalidas,
        duracao_ms: ms,
        status: erros + invalidas > 0 ? "PARCIAL" : "SUCESSO",
        detalhes: { rpc: detalhes, invalidas: detalhesInvalidos },
      });

      return { total: rows.length, importadas: inseridas + atualizadas, atualizadas, ignoradas: ignoradasTotal, erros: erros + invalidas, ms };
    },
    onSuccess: (r) => {
      setResultado({
        total: r.total,
        importadas: r.importadas,
        atualizadas: r.atualizadas,
        ignoradas: r.ignoradas,
        erros: r.erros,
        ms: r.ms,
      });
      toast.success(`Importação concluída em ${(r.ms / 1000).toFixed(1)}s.`);
      setProgress(100);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha na importação.";
      toast.error(msg);
      setProgress(0);
    },
  });

  function reset() {
    setRows([]);
    setFileName("");
    setFileSize(0);
    setProgress(0);
    setResultado(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <AppShell title="Importar Colaboradores" breadcrumb={["Operação", "Colaboradores", "Importar"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/colaboradores" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={baixarModelo}>
            <Download className="mr-2 h-4 w-4" /> Baixar modelo
          </Button>
          <Button asChild variant="outline">
            <Link to="/colaboradores/importacoes">
              <History className="mr-2 h-4 w-4" /> Histórico
            </Link>
          </Button>
        </div>
      </div>

      {!canImport && (
        <Alert variant="destructive">
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Apenas Super Admin e RH podem importar colaboradores.</AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Selecione um arquivo .xlsx ou .csv</p>
            <p className="text-xs text-muted-foreground">Máximo 20MB · A primeira linha deve conter os cabeçalhos</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFile}
            disabled={!canImport}
          />
          <div className="flex gap-2">
            <Button onClick={() => fileInputRef.current?.click()} disabled={!canImport}>
              <Upload className="mr-2 h-4 w-4" /> Selecionar arquivo
            </Button>
            {fileName && (
              <Button variant="ghost" onClick={reset}>
                Limpar
              </Button>
            )}
          </div>
          {fileName && (
            <p className="text-xs text-muted-foreground">
              {fileName} · {(fileSize / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Badge variant="outline">Total: {summary.total}</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Válidas: {summary.ok}</Badge>
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Duplicadas: {summary.dup}</Badge>
              <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">Erros: {summary.err}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <Switch id="atualizar" checked={atualizar} onCheckedChange={setAtualizar} disabled={importar.isPending} />
                <Label htmlFor="atualizar" className="cursor-pointer text-sm">
                  Atualizar colaboradores existentes
                </Label>
              </div>
              <Button
                onClick={() => importar.mutate()}
                disabled={!canImport || importar.isPending || summary.ok + (atualizar ? summary.dup : 0) === 0}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importar {summary.ok + (atualizar ? summary.dup : 0)} linha(s)
              </Button>
            </div>
            {(importar.isPending || progress > 0) && (
              <div className="mt-4">
                <Progress value={progress} />
                <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
              </div>
            )}
          </Card>

          {resultado && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Importação finalizada</AlertTitle>
              <AlertDescription>
                Total: <b>{resultado.total}</b> · Importadas: <b>{resultado.importadas}</b> · Atualizadas: <b>{resultado.atualizadas}</b> · Ignoradas: <b>{resultado.ignoradas}</b> · Erros: <b>{resultado.erros}</b> · Tempo: <b>{(resultado.ms / 1000).toFixed(2)}s</b>
              </AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden">
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Linha</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.linha}>
                      <TableCell className="text-xs text-muted-foreground">{r.linha}</TableCell>
                      <TableCell className="text-sm">{r.empresa || "—"}</TableCell>
                      <TableCell className="text-sm">{r.projeto || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{r.matricula || "—"}</TableCell>
                      <TableCell className="text-sm">{r.nome_completo || "—"}</TableCell>
                      <TableCell>
                        {r.status === "OK" && (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> OK
                          </Badge>
                        )}
                        {r.status === "DUPLICADA" && (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Duplicada</Badge>
                        )}
                        {r.status === "ERRO" && (
                          <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">
                            <XCircle className="mr-1 h-3 w-3" /> Erro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.mensagem}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
