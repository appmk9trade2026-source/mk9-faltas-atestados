import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Upload,
  UserCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import {
  COLABORADOR_HEADER_ALIASES,
  buildRowIndex,
  diagnoseHeaders,
  pickField,
  suspectUnmappedSupervisorEmail,
  type HeaderDiagnostic,
} from "@/lib/xlsx-headers";
import { normalizeMatricula } from "@/lib/matricula";
import {
  confirmarVinculoSupervisor,
  reprocessarSupervisoresPlanilha,
  type ReprocessarSupervisorDetalhe,
  type ReprocessarSupervisorResultado,
} from "@/lib/reprocessar-supervisores-planilha.functions";
import { friendlyRbacError } from "@/lib/rbac/errors";

export const Route = createFileRoute(
  "/_authenticated/colaboradores_/reprocessar-supervisores",
)({
  head: () => ({ meta: [{ title: "Reprocessar Supervisores · CRM MK9" }] }),
  component: ReprocessarSupervisoresPage,
});

type LinhaPlanilha = {
  linha: number;
  matricula: string;
  supervisor_email: string;
  supervisor_nome: string;
};

const CHUNK = 100;

function ReprocessarSupervisoresPage() {
  const { roles } = useSession();
  const podeReprocessar = roles.includes("super_admin") || roles.includes("rh");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [diag, setDiag] = useState<HeaderDiagnostic | null>(null);
  const [resultado, setResultado] = useState<ReprocessarSupervisorResultado | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});

  const bloqueado = !diag
    ? true
    : diag.faltando.some((f) => f === "matricula") ||
      !diag.encontrados.supervisor_email ||
      suspectUnmappedSupervisorEmail(diag);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResultado(null);
    setConfirmados({});
    setProgresso(0);
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });
      const d = diagnoseHeaders(raw[0], ["matricula"]);
      setDiag(d);
      const rows: LinhaPlanilha[] = [];
      raw.forEach((r, idx) => {
        const rowIdx = buildRowIndex(r);
        const pick = (f: keyof typeof COLABORADOR_HEADER_ALIASES) =>
          String(pickField(rowIdx, COLABORADOR_HEADER_ALIASES[f]) ?? "").trim();
        const matricula = normalizeMatricula(pick("matricula"));
        if (!matricula) return;
        rows.push({
          linha: idx + 2,
          matricula,
          supervisor_email: pick("supervisor_email").toLowerCase(),
          supervisor_nome: pick("supervisor_nome"),
        });
      });
      setLinhas(rows);
      toast.success(`Planilha carregada: ${rows.length} linha(s) com matrícula.`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível ler o arquivo.");
    }
  }

  const reprocessar = useMutation({
    mutationFn: async () => {
      if (linhas.length === 0) throw new Error("Nenhuma linha para reprocessar.");
      const chunks: LinhaPlanilha[][] = [];
      for (let i = 0; i < linhas.length; i += CHUNK) chunks.push(linhas.slice(i, i + CHUNK));
      let acc: ReprocessarSupervisorResultado = {
        total: 0,
        localizados: 0,
        nao_localizados: 0,
        colab_ambiguo: 0,
        email_recuperado: 0,
        vinculados: 0,
        inexistente: 0,
        email_vazio: 0,
        email_invalido: 0,
        duplicidade: 0,
        sem_papel_supervisor: 0,
        divergencia_digitacao: 0,
        detalhes: [],
      };
      for (let i = 0; i < chunks.length; i++) {
        const r = await reprocessarSupervisoresPlanilha({ data: { rows: chunks[i] } });
        acc = {
          total: acc.total + r.total,
          localizados: acc.localizados + r.localizados,
          nao_localizados: acc.nao_localizados + r.nao_localizados,
          colab_ambiguo: acc.colab_ambiguo + r.colab_ambiguo,
          email_recuperado: acc.email_recuperado + r.email_recuperado,
          vinculados: acc.vinculados + r.vinculados,
          inexistente: acc.inexistente + r.inexistente,
          email_vazio: acc.email_vazio + r.email_vazio,
          email_invalido: acc.email_invalido + r.email_invalido,
          duplicidade: acc.duplicidade + r.duplicidade,
          sem_papel_supervisor: acc.sem_papel_supervisor + r.sem_papel_supervisor,
          divergencia_digitacao: acc.divergencia_digitacao + r.divergencia_digitacao,
          detalhes: acc.detalhes.concat(r.detalhes),
        };
        setProgresso(Math.round(((i + 1) / chunks.length) * 100));
      }
      return acc;
    },
    onSuccess: (r) => {
      setResultado(r);
      toast.success(
        `Reprocessamento concluído. ${r.vinculados} vínculo(s) criado(s), ${r.divergencia_digitacao} divergência(s) aguardando confirmação.`,
      );
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["inteligencia"] });
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
    },
  });

  const confirmar = useMutation({
    mutationFn: async (input: { colaborador_id: string; supervisor_usuario_id: string }) => {
      return await confirmarVinculoSupervisor({ data: input });
    },
    onSuccess: (_r, vars) => {
      setConfirmados((prev) => ({ ...prev, [vars.colaborador_id]: true }));
      toast.success("Vínculo confirmado.");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["inteligencia"] });
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
    },
  });

  function baixarCsv() {
    if (!resultado) return;
    const header = [
      "linha", "matricula", "colaborador_id", "colaborador_nome", "email",
      "nome_planilha", "motivo", "supervisor_usuario_id",
      "candidato_id", "candidato_email", "candidato_nome", "quantidade",
    ];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = resultado.detalhes.map((d) => header.map((h) => escape((d as Record<string, unknown>)[h])).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reprocessamento-supervisores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const divergencias = useMemo<ReprocessarSupervisorDetalhe[]>(
    () => (resultado?.detalhes ?? []).filter((d) => d.motivo === "DIVERGENCIA_DIGITACAO"),
    [resultado],
  );
  const naoLocalizadas = useMemo(
    () => (resultado?.detalhes ?? []).filter((d) => d.motivo !== "VINCULADO" && d.motivo !== "DIVERGENCIA_DIGITACAO"),
    [resultado],
  );

  if (!podeReprocessar) {
    return (
      <AppShell title="Reprocessar supervisores" breadcrumb={["Colaboradores", "Reprocessar supervisores"]}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>
            Somente Super Admin ou RH podem reprocessar vínculos de supervisor.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell title="Reprocessar Supervisores por planilha" breadcrumb={["Colaboradores", "Reprocessar supervisores"]}>
      <Alert>
        <UserCheck className="h-4 w-4" />
        <AlertTitle>Recuperação de vínculos oficiais</AlertTitle>
        <AlertDescription>
          Envie novamente a planilha completa de colaboradores. O sistema irá
          <b> preencher supervisor_email </b> nos registros existentes (localizando
          pela matrícula) e, quando o e-mail corresponder a um usuário com papel
          <b> Supervisor </b> ativo, criará automaticamente o vínculo oficial. Divergências
          de digitação de e-mail serão listadas para confirmação manual.
        </AlertDescription>
      </Alert>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFile}
          />
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Selecionar planilha
          </Button>
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{linhas.length} linha(s) com matrícula</Badge>
            <Button
              onClick={() => reprocessar.mutate()}
              disabled={reprocessar.isPending || bloqueado || linhas.length === 0}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${reprocessar.isPending ? "animate-spin" : ""}`} />
              Reprocessar {linhas.length} linha(s)
            </Button>
          </div>
        </div>

        {diag && (
          <div className="mt-3">
            {diag.faltando.some((f) => f === "matricula") && (
              <Alert variant="destructive" className="mb-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Coluna Matrícula não encontrada</AlertTitle>
                <AlertDescription>A planilha precisa conter a coluna <b>Matrícula</b>.</AlertDescription>
              </Alert>
            )}
            {!diag.encontrados.supervisor_email && (
              <Alert variant="destructive" className="mb-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Coluna Email Supervisor não encontrada</AlertTitle>
                <AlertDescription>
                  Renomeie o cabeçalho da coluna de e-mail do supervisor para <b>Email Supervisor</b>.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Cabeçalhos: {diag.headers_brutos.join(" · ")}
            </p>
          </div>
        )}

        {(reprocessar.isPending || progresso > 0) && (
          <div className="mt-3">
            <Progress value={progresso} />
            <p className="mt-1 text-xs text-muted-foreground">{progresso}%</p>
          </div>
        )}
      </Card>

      {resultado && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <h3 className="text-base font-semibold">Resultado</h3>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={baixarCsv}>
                <Download className="mr-2 h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <Info label="Total" value={resultado.total} />
            <Info label="Localizados" value={resultado.localizados} />
            <Info label="Vinculados" value={resultado.vinculados} tone="ok" />
            <Info label="E-mails recuperados" value={resultado.email_recuperado} />
            <Info label="Divergência de digitação" value={resultado.divergencia_digitacao} tone="warn" />
            <Info label="Supervisor inexistente" value={resultado.inexistente} tone="warn" />
            <Info label="E-mail vazio" value={resultado.email_vazio} />
            <Info label="E-mail inválido" value={resultado.email_invalido} tone="warn" />
            <Info label="Duplicidade de e-mail" value={resultado.duplicidade} tone="warn" />
            <Info label="Sem papel supervisor" value={resultado.sem_papel_supervisor} tone="warn" />
            <Info label="Colaborador não localizado" value={resultado.nao_localizados} tone="warn" />
            <Info label="Colaborador ambíguo" value={resultado.colab_ambiguo} tone="warn" />
          </div>
        </Card>
      )}

      {divergencias.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold">
            Divergências de digitação ({divergencias.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            O e-mail informado na planilha não existe, mas há um supervisor ativo com
            o mesmo nome. Confirme manualmente para gravar o vínculo com o e-mail
            oficial do perfil.
          </p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>E-mail na planilha</TableHead>
                  <TableHead>Candidato (perfil)</TableHead>
                  <TableHead>E-mail do perfil</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divergencias.map((d) => {
                  const ok = d.colaborador_id ? confirmados[d.colaborador_id] : false;
                  return (
                    <TableRow key={`${d.matricula}-${d.candidato_id}`}>
                      <TableCell className="font-medium">{d.colaborador_nome ?? "—"}</TableCell>
                      <TableCell>{d.matricula}</TableCell>
                      <TableCell className="text-muted-foreground">{d.email}</TableCell>
                      <TableCell>{d.candidato_nome}</TableCell>
                      <TableCell className="text-muted-foreground">{d.candidato_email}</TableCell>
                      <TableCell className="text-right">
                        {ok ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Confirmado
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={confirmar.isPending || !d.colaborador_id || !d.candidato_id}
                            onClick={() =>
                              confirmar.mutate({
                                colaborador_id: d.colaborador_id!,
                                supervisor_usuario_id: d.candidato_id!,
                              })
                            }
                          >
                            Confirmar vínculo
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {naoLocalizadas.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold">
            Itens que exigem atenção ({naoLocalizadas.length})
          </h3>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {naoLocalizadas.slice(0, 300).map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(d.linha ?? "")}</TableCell>
                    <TableCell>{d.matricula}</TableCell>
                    <TableCell className="text-muted-foreground">{d.email ?? ""}</TableCell>
                    <TableCell>{d.motivo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {naoLocalizadas.length > 300 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Exibindo 300 primeiras linhas. Exporte o CSV para o relatório completo.
              </p>
            )}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function Info({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-400/40 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-400/40 bg-amber-500/5"
        : "";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
