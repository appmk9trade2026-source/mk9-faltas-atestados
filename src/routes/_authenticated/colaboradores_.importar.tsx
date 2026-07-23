import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  RefreshCw,
  Upload,
  Wand2,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { normalizeMatricula } from "@/lib/matricula";
import { normalizeName } from "@/lib/normalize-name";
import { importColaboradoresBulk } from "@/lib/colaboradores.functions";
import { friendlyRbacError } from "@/lib/rbac/errors";
import {
  COLABORADOR_HEADER_ALIASES,
  buildRowIndex,
  diagnoseHeaders,
  normalizeHeader,
  pickField,
  pickFieldWithSource,
  suspectUnmappedSupervisorEmail,
  type HeaderDiagnostic,
} from "@/lib/xlsx-headers";


export const Route = createFileRoute("/_authenticated/colaboradores_/importar")({
  head: () => ({
    meta: [
      { title: "Importar Colaboradores · CRM MK9" },
      {
        name: "description",
        content: "Importação validada de colaboradores com resolução manual de projetos ambíguos.",
      },
      { property: "og:title", content: "Importar Colaboradores · CRM MK9" },
      {
        property: "og:description",
        content: "Importação validada de colaboradores com resolução manual de projetos ambíguos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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

type ErrorCode =
  | "OK"
  | "EMPRESA_OBRIGATORIA"
  | "EMPRESA_NAO_ENCONTRADA"
  | "EMPRESA_AMBIGUA"
  | "EMPRESA_INATIVA"
  | "PROJETO_OBRIGATORIO"
  | "PROJETO_NAO_ENCONTRADO"
  | "PROJETO_AMBIGUO"
  | "PROJETO_INATIVO"
  | "PROJETO_OUTRA_EMPRESA"
  | "MATRICULA_OBRIGATORIA"
  | "MATRICULA_DUPLICADA_ARQUIVO"
  | "NOME_OBRIGATORIO"
  | "EMAIL_INVALIDO"
  | "SUPERVISOR_EMAIL_INVALIDO"
  | "SUPERVISOR_EMAIL_AUSENTE"
  | "TELEFONE_INVALIDO"
  | "WHATSAPP_INVALIDO";

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
  empresa_id: string | null;
  projeto_id: string | null;
  status: RowStatus;
  erros: { code: ErrorCode; msg: string }[];
  /** Sugestões de projeto quando o nome não bateu exatamente. */
  sugestoes_projeto?: { id: string; nome: string }[];
  /** Nome cadastrado do projeto encontrado (para exibição quando difere do informado). */
  projeto_localizado_nome?: string | null;
  /** true quando o vínculo foi resolvido por normalização (hífen, acento, espaços). */
  projeto_por_normalizacao?: boolean;
};

const digitsOnly = (v: string) => v.replace(/\D+/g, "");
const isValidEmail = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const norm = (v: unknown) => String(v ?? "").trim();
/** Chave lógica de comparação (upper + sem acentos + hífens→espaço + colapso). */
const nameKey = (v: string) => normalizeName(v);

type Empresa = { id: string; nome: string; ativo: boolean };
type Projeto = { id: string; nome: string; empresa_id: string; ativo: boolean };

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
  /** Escolhas de resolução: chave = `empresa_id::PROJETO_NORMALIZADO` → projeto_id */
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{
    total: number;
    importadas: number;
    atualizadas: number;
    ignoradas: number;
    erros: number;
    ms: number;
  } | null>(null);
  const [headerDiag, setHeaderDiag] = useState<HeaderDiagnostic | null>(null);
  const [supEmailTrace, setSupEmailTrace] = useState<{
    headerBruto: string | null;
    headerNormalizado: string | null;
    aliasResolvido: string | null;
    valorMascarado: string;
    valorPresente: boolean;
  } | null>(null);


  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ["empresas-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id,nome,ativo");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: projetos = [] } = useQuery<Projeto[]>({
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

  // Fase A — Diagnóstico global de projetos equivalentes (empresa + nome normalizado).
  type DiagProjeto = {
    projeto_id: string;
    nome: string;
    codigo_interno: string | null;
    codigo_protocolo: string | null;
    ativo: boolean;
    colaboradores: number;
    ausencias: number;
    alertas: number;
    protocolos: number;
    usuarios: number;
    created_at: string;
    ultima_ausencia: string | null;
  };
  type DiagGrupo = {
    empresa_id: string;
    empresa_nome: string;
    chave: string;
    qtd: number;
    projetos: DiagProjeto[];
  };
  const { data: diagnostico } = useQuery({
    queryKey: ["projetos-duplicados-diagnostico"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("diagnose_projetos_duplicados");
      if (error) throw error;
      return data as { total_grupos: number; total_projetos_envolvidos: number; grupos: DiagGrupo[] };
    },
    enabled: canImport,
  });

  const grupoInfoByKey = useMemo(() => {
    const m = new Map<string, DiagProjeto[]>();
    for (const g of diagnostico?.grupos ?? []) {
      m.set(`${g.empresa_id}::${g.chave}`, g.projetos);
    }
    return m;
  }, [diagnostico]);

  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.status === "OK").length;
    const err = rows.filter((r) => r.status === "ERRO").length;
    const dup = rows.filter((r) => r.status === "DUPLICADA").length;
    return { total: rows.length, ok, err, dup };
  }, [rows]);

  // Grupos de resolução manual de projeto (mantém também os já resolvidos para feedback visual).
  const gruposResolucao = useMemo(() => {
    const alvos = new Set<ErrorCode>([
      "PROJETO_NAO_ENCONTRADO",
      "PROJETO_AMBIGUO",
      "PROJETO_OUTRA_EMPRESA",
      "PROJETO_INATIVO",
    ]);
    const groups = new Map<string, {
      key: string;
      empresa_id: string;
      empresa_nome: string;
      projeto_input: string;
      motivo: ErrorCode;
      linhas: number[];
      sugestoes: { id: string; nome: string }[];
    }>();
    for (const r of rows) {
      if (!r.empresa_id) continue;
      const err = r.erros.find((e) => alvos.has(e.code));
      const key = `${r.empresa_id}::${nameKey(r.projeto)}`;
      const resolved = Boolean(resolucoes[key]);
      if (!err && !resolved) continue;
      const g = groups.get(key);
      if (g) {
        g.linhas.push(r.linha);
      } else {
        groups.set(key, {
          key,
          empresa_id: r.empresa_id,
          empresa_nome: r.empresa,
          projeto_input: r.projeto,
          motivo: err?.code ?? "OK",
          linhas: [r.linha],
          sugestoes: r.sugestoes_projeto ?? [],
        });
      }
    }
    return Array.from(groups.values());
  }, [resolucoes, rows]);

  const gruposResolvidos = useMemo(
    () => gruposResolucao.filter((g) => Boolean(resolucoes[g.key])).length,
    [gruposResolucao, resolucoes],
  );

  const gruposPendentes = gruposResolucao.length - gruposResolvidos;

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
    setResolucoes({});
    setHeaderDiag(null);
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
      const diag = diagnoseHeaders(raw[0]);
      setHeaderDiag(diag);
      const parsed = validar(raw, {});
      setRows(parsed);
      if (diag.faltando.length > 0) {
        toast.warning(
          `Cabeçalhos obrigatórios faltando: ${diag.faltando.join(", ")}. Corrija a planilha antes de confirmar.`,
        );
      } else if (suspectUnmappedSupervisorEmail(diag)) {
        toast.warning(
          "A planilha contém uma coluna parecida com 'email supervisor' mas não pôde ser mapeada. Renomeie para 'Email Supervisor'.",
        );
      } else {
        toast.success(`Planilha carregada: ${parsed.length} linha(s).`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível ler o arquivo.");
    }
  }


  function validar(
    raw: Record<string, unknown>[],
    resolvedMap: Record<string, string>,
  ): ParsedRow[] {
    // Índices normalizados (upper + colapso de espaços)
    const empresaByKey = new Map<string, Empresa[]>();
    for (const e of empresas) {
      const k = nameKey(e.nome);
      const arr = empresaByKey.get(k) ?? [];
      arr.push(e);
      empresaByKey.set(k, arr);
    }
    const projetoByEmpKey = new Map<string, Projeto[]>();
    const projetoByKeyGlobal = new Map<string, Projeto[]>();
    const projetosByEmpresa = new Map<string, Projeto[]>();
    for (const p of projetos) {
      const k = nameKey(p.nome);
      const empKey = `${p.empresa_id}::${k}`;
      const a1 = projetoByEmpKey.get(empKey) ?? [];
      a1.push(p); projetoByEmpKey.set(empKey, a1);
      const a2 = projetoByKeyGlobal.get(k) ?? [];
      a2.push(p); projetoByKeyGlobal.set(k, a2);
      const a3 = projetosByEmpresa.get(p.empresa_id) ?? [];
      a3.push(p); projetosByEmpresa.set(p.empresa_id, a3);
    }
    const matriculasBanco = new Set(
      existentes.map((c) => `${c.empresa_id}::${c.matricula}`),
    );
    const matriculasArquivo = new Set<string>();

    return raw
      .map((r, idx) => {
        const linha = idx + 2;
        const rowIdx = buildRowIndex(r);
        const pick = (f: keyof typeof COLABORADOR_HEADER_ALIASES) =>
          norm(pickField(rowIdx, COLABORADOR_HEADER_ALIASES[f]) as unknown);
        const matricula = normalizeMatricula(pick("matricula"));
        const nome_completo = pick("nome_completo");
        const projeto = pick("projeto");
        const empresa = pick("empresa");
        const telefone = digitsOnly(pick("telefone"));
        const whatsapp = digitsOnly(pick("whatsapp"));
        const email = pick("email").toLowerCase();
        const supervisor_nome = pick("supervisor_nome");
        const supervisor_telefone = digitsOnly(pick("supervisor_telefone"));
        const supervisor_email = pick("supervisor_email").toLowerCase();


        const vazia = ![matricula, nome_completo, projeto, empresa, telefone, whatsapp, email, supervisor_nome].some(
          (v) => v && v.length > 0,
        );
        if (vazia) return null;

        const erros: { code: ErrorCode; msg: string }[] = [];
        let empresa_id: string | null = null;
        let projeto_id: string | null = null;
        let sugestoes_projeto: { id: string; nome: string }[] | undefined;
        let projeto_localizado_nome: string | null = null;
        let projeto_por_normalizacao = false;

        // Campos base
        if (!matricula) erros.push({ code: "MATRICULA_OBRIGATORIA", msg: "Matrícula obrigatória." });
        if (!nome_completo) erros.push({ code: "NOME_OBRIGATORIO", msg: "Nome obrigatório." });
        if (email && !isValidEmail(email))
          erros.push({ code: "EMAIL_INVALIDO", msg: `E-mail inválido ("${email}").` });
        if (supervisor_email && !isValidEmail(supervisor_email))
          erros.push({ code: "SUPERVISOR_EMAIL_INVALIDO", msg: `E-mail do supervisor inválido ("${supervisor_email}").` });
        // Guarda: se a coluna de e-mail do supervisor foi reconhecida na planilha
        // e a linha traz nome ou telefone do supervisor, o e-mail não pode vir vazio.
        // Isso evita gravar vínculo parcial silenciosamente por falha de leitura.
        if (
          headerDiag?.encontrados.supervisor_email &&
          !supervisor_email &&
          (supervisor_nome || supervisor_telefone)
        ) {
          erros.push({
            code: "SUPERVISOR_EMAIL_AUSENTE",
            msg: "Coluna 'Email Supervisor' foi reconhecida mas a linha veio sem e-mail; corrija a planilha para evitar vínculo incompleto.",
          });
        }
        if (telefone && (telefone.length < 10 || telefone.length > 13))
          erros.push({ code: "TELEFONE_INVALIDO", msg: "Telefone inválido (10 a 13 dígitos)." });
        if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13))
          erros.push({ code: "WHATSAPP_INVALIDO", msg: "WhatsApp inválido (10 a 13 dígitos)." });

        // Empresa
        if (!empresa) {
          erros.push({ code: "EMPRESA_OBRIGATORIA", msg: "Empresa obrigatória." });
        } else {
          const matches = empresaByKey.get(nameKey(empresa)) ?? [];
          if (matches.length === 0) {
            erros.push({ code: "EMPRESA_NAO_ENCONTRADA", msg: `Empresa "${empresa}" não encontrada.` });
          } else if (matches.length > 1) {
            erros.push({ code: "EMPRESA_AMBIGUA", msg: `Existem várias empresas cadastradas como "${empresa}".` });
          } else if (!matches[0].ativo) {
            empresa_id = matches[0].id;
            erros.push({ code: "EMPRESA_INATIVA", msg: `Empresa "${empresa}" está inativa.` });
          } else {
            empresa_id = matches[0].id;
          }
        }

        // Projeto — busca SEMPRE por empresa_id + nome normalizado.
        if (!projeto) {
          erros.push({ code: "PROJETO_OBRIGATORIO", msg: "Projeto obrigatório." });
        } else if (empresa_id) {
          const projKey = nameKey(projeto);
          const empKey = `${empresa_id}::${projKey}`;

          // 1) Escolha prévia do usuário (etapa Resolver projetos)
          const chosen = resolvedMap[empKey];
          if (chosen) {
            const p = projetos.find((x) => x.id === chosen);
            if (p && p.empresa_id === empresa_id && p.ativo) {
              projeto_id = p.id;
              projeto_localizado_nome = p.nome;
              if (nameKey(p.nome) !== nameKey(projeto)) projeto_por_normalizacao = true;
            }
          }

          if (!projeto_id) {
            const matches = projetoByEmpKey.get(empKey) ?? [];
            if (matches.length === 1) {
              if (!matches[0].ativo) {
                erros.push({ code: "PROJETO_INATIVO", msg: `Projeto "${projeto}" está inativo.` });
              } else {
                projeto_id = matches[0].id;
                projeto_localizado_nome = matches[0].nome;
                if (matches[0].nome.trim() !== projeto.trim()) projeto_por_normalizacao = true;
              }
            } else if (matches.length > 1) {
              // Ambiguidade real (dois cadastros com a mesma chave normalizada).
              erros.push({
                code: "PROJETO_AMBIGUO",
                msg:
                  `Projeto ambíguo: existem ${matches.length} cadastros equivalentes na empresa "${empresa}" ` +
                  `(${matches.map((p) => `"${p.nome}"`).join(", ")}). Selecione o correto.`,
              });
              sugestoes_projeto = matches.map((p) => ({ id: p.id, nome: p.nome }));
            } else {
              // Não achou por nome normalizado. Testar em outras empresas para dar mensagem específica.
              const outros = projetoByKeyGlobal.get(projKey) ?? [];
              if (outros.length > 0) {
                const donos = Array.from(new Set(outros.map((p) => {
                  const e = empresas.find((e) => e.id === p.empresa_id);
                  return e?.nome ?? "outra empresa";
                }))).join(", ");
                erros.push({
                  code: "PROJETO_OUTRA_EMPRESA",
                  msg: `O projeto "${projeto}" existe, mas pertence à empresa ${donos}.`,
                });
              } else {
                erros.push({
                  code: "PROJETO_NAO_ENCONTRADO",
                  msg:
                    `Projeto "${projeto}" não foi encontrado na empresa "${empresa}", ` +
                    `mesmo após normalização de espaços, acentos e hífens.`,
                });
              }
              // Sugestões: projetos da MESMA empresa (sem correspondência automática).
              const disponiveis = (projetosByEmpresa.get(empresa_id) ?? []).filter((p) => p.ativo);
              const semelhantes = disponiveis.filter((p) => {
                const k = nameKey(p.nome);
                return k.includes(projKey) || projKey.includes(k);
              });
              sugestoes_projeto = (semelhantes.length ? semelhantes : disponiveis)
                .slice(0, 20)
                .map((p) => ({ id: p.id, nome: p.nome }));
            }
          }
        }

        // Duplicidade de matrícula no arquivo / banco
        let status: RowStatus = "OK";
        if (empresa_id && matricula) {
          const key = `${empresa_id}::${matricula}`;
          if (matriculasArquivo.has(key))
            erros.push({ code: "MATRICULA_DUPLICADA_ARQUIVO", msg: "Matrícula duplicada no arquivo." });
          matriculasArquivo.add(key);
          if (matriculasBanco.has(key)) status = "DUPLICADA";
        }

        if (erros.length > 0) status = "ERRO";
        else if (status !== "DUPLICADA") status = "OK";

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
          empresa_id,
          projeto_id,
          status,
          erros,
          sugestoes_projeto,
          projeto_localizado_nome,
          projeto_por_normalizacao,
        } as ParsedRow;
      })
      .filter((r): r is ParsedRow => r !== null);
  }

  function revalidar() {
    if (!fileName) return;
    // Reaproveitar linhas parseadas: reconstruir raw a partir de rows atuais
    const raw = rows.map((r) => ({
      "Matrícula": r.matricula,
      "Nome Completo": r.nome_completo,
      "Projeto": r.projeto,
      "Empresa": r.empresa,
      "Telefone do Colaborador": r.telefone,
      "WhatsApp": r.whatsapp,
      "Email": r.email,
      "Supervisor(a)": r.supervisor_nome,
      "Telefone do Supervisor": r.supervisor_telefone,
      "Email Supervisor": r.supervisor_email,
    }));
    setRows(validar(raw, resolucoes));
    toast.success("Linhas revalidadas com as resoluções aplicadas.");
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
          empresa_id: r.empresa_id, // ← IDs pré-resolvidos
          projeto_id: r.projeto_id, // ←
          telefone: r.telefone,
          whatsapp: r.whatsapp,
          email: r.email,
          supervisor_nome: r.supervisor_nome,
          supervisor_telefone: r.supervisor_telefone,
          supervisor_email: r.supervisor_email,
        }));
        const r = await importColaboradoresBulk({
          data: { rows: slice, atualizar },
        });
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
        .map((r) => ({ linha: r.linha, erro: r.erros.map((e) => e.msg).join(" · ") }));

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
      const f = friendlyRbacError(e);
      toast.error(f.title, { description: f.description });
      setProgress(0);
    },
  });

  function reset() {
    setRows([]);
    setFileName("");
    setFileSize(0);
    setProgress(0);
    setResultado(null);
    setResolucoes({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function setResolucao(key: string, projetoId: string) {
    const next = { ...resolucoes, [key]: projetoId };
    setResolucoes(next);
    // Revalidação automática — o usuário não precisa clicar em "Validar novamente".
    if (rows.length > 0) {
      const raw = rows.map((r) => ({
        "Matrícula": r.matricula,
        "Nome Completo": r.nome_completo,
        "Projeto": r.projeto,
        "Empresa": r.empresa,
        "Telefone do Colaborador": r.telefone,
        "WhatsApp": r.whatsapp,
        "Email": r.email,
        "Supervisor(a)": r.supervisor_nome,
        "Telefone do Supervisor": r.supervisor_telefone,
        "Email Supervisor": r.supervisor_email,
      }));
      setRows(validar(raw, next));
      toast.success("Projeto selecionado. Linhas do grupo revalidadas automaticamente.");
    }
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

      {headerDiag && (headerDiag.faltando.length > 0 || suspectUnmappedSupervisorEmail(headerDiag)) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cabeçalhos da planilha precisam de atenção</AlertTitle>
          <AlertDescription>
            {headerDiag.faltando.length > 0 && (
              <p>
                Colunas obrigatórias não encontradas:{" "}
                <b>{headerDiag.faltando.join(", ")}</b>. A importação está bloqueada
                até que a planilha contenha esses campos.
              </p>
            )}
            {suspectUnmappedSupervisorEmail(headerDiag) && (
              <p className="mt-1">
                Detectamos uma coluna parecida com "email supervisor" que não pôde
                ser reconhecida. Renomeie o cabeçalho exatamente para{" "}
                <b>Email Supervisor</b>.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {headerDiag && headerDiag.faltando.length === 0 && !suspectUnmappedSupervisorEmail(headerDiag) && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Cabeçalhos reconhecidos</AlertTitle>
          <AlertDescription className="text-xs">
            {(Object.entries(headerDiag.encontrados) as [string, string | null][])
              .filter(([, v]) => v)
              .map(([k, v]) => `${k} ← "${v}"`)
              .join(" · ")}
            {headerDiag.desconhecidos.length > 0 && (
              <span className="text-muted-foreground">
                {" · "}Ignorados: {headerDiag.desconhecidos.join(", ")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}



      {rows.length > 0 && diagnostico && diagnostico.total_grupos > 0 && (
        <Card className="border-sky-400/40 bg-sky-500/5 p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-sky-500" />
            Diagnóstico de projetos equivalentes no sistema
          </h3>
          <p className="text-sm text-muted-foreground">
            Foram encontrados <b>{diagnostico.total_grupos}</b> grupo(s) de projetos
            com o mesmo nome normalizado dentro da mesma empresa
            (<b>{diagnostico.total_projetos_envolvidos}</b> cadastros no total).
            A importação abaixo continua funcionando — você escolhe o projeto correto por grupo.
            A consolidação definitiva será feita em uma etapa administrativa dedicada.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-sky-700 dark:text-sky-300">
              Ver detalhes dos grupos
            </summary>
            <div className="mt-2 space-y-2">
              {diagnostico.grupos.map((g) => (
                <div key={`${g.empresa_id}::${g.chave}`} className="rounded border bg-background/60 p-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{g.empresa_nome}</Badge>
                    <span className="font-mono text-muted-foreground">chave:</span>
                    <code className="rounded bg-muted px-1.5 py-0.5">{g.chave}</code>
                    <Badge variant="secondary">{g.qtd} cadastros</Badge>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {g.projetos.map((p) => (
                      <li key={p.projeto_id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.nome}</span>
                        <span className="font-mono text-muted-foreground">{p.codigo_interno}</span>
                        {p.codigo_protocolo && (
                          <Badge variant="outline" className="text-[10px]">{p.codigo_protocolo}</Badge>
                        )}
                        <Badge className={p.ativo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted"}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                        <span className="text-muted-foreground">
                          {p.colaboradores} colab · {p.ausencias} aus · {p.protocolos} prot
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      {rows.length > 0 && gruposResolucao.length > 0 && (
        <Card className="border-amber-400/40 bg-amber-500/5 p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Wand2 className="h-4 w-4 text-amber-500" />
                Resolver projetos ({gruposPendentes} pendente{gruposPendentes !== 1 ? "s" : ""} · {gruposResolvidos} resolvido{gruposResolvidos !== 1 ? "s" : ""})
              </h3>
              <p className="text-sm text-muted-foreground">
                A escolha é aplicada automaticamente a todas as linhas equivalentes e o
                <code className="mx-1 rounded bg-muted px-1">projeto_id</code> selecionado é usado na importação
                — o servidor <b>não faz nova busca por nome</b>.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={revalidar}>
              <RefreshCw className="mr-2 h-4 w-4" /> Validar novamente
            </Button>
          </div>

          <div className="space-y-3">
            {gruposResolucao.map((g) => {
              const opts = projetos.filter((p) => p.empresa_id === g.empresa_id && p.ativo);
              const semelhantes = g.sugestoes;
              // Se for ambíguo, temos metadados ricos via diagnóstico.
              const equivalentes = grupoInfoByKey.get(g.key) ?? [];
              const hasResolucao = Boolean(resolucoes[g.key]);
              const showEquivalentCards = equivalentes.length > 0;
              return (
                <div key={g.key} className="rounded-lg border bg-background p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{g.empresa_nome}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">→</span>
                    <span className="font-medium">{g.projeto_input || "(vazio)"}</span>
                    {!hasResolucao && (
                      <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">
                        {g.motivo === "PROJETO_NAO_ENCONTRADO" && "Não encontrado"}
                        {g.motivo === "PROJETO_AMBIGUO" && "Ambíguo"}
                        {g.motivo === "PROJETO_OUTRA_EMPRESA" && "Existe em outra empresa"}
                        {g.motivo === "PROJETO_INATIVO" && "Inativo"}
                      </Badge>
                    )}
                    <Badge variant="secondary">{g.linhas.length} linha{g.linhas.length > 1 ? "s" : ""}</Badge>
                    {hasResolucao && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Resolvido
                      </Badge>
                    )}
                  </div>

                  {showEquivalentCards ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {equivalentes.map((p) => {
                        const selected = resolucoes[g.key] === p.projeto_id;
                        return (
                          <button
                            key={p.projeto_id}
                            type="button"
                            aria-pressed={selected}
                            aria-label={`Usar projeto ${p.codigo_interno ?? p.nome}`}
                            onClick={() => setResolucao(g.key, p.projeto_id)}
                            className={`flex flex-col gap-3 rounded-lg border p-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              selected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                : "hover:border-primary/40 hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="text-lg leading-none" aria-hidden="true">
                                  {selected ? "●" : "○"}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-semibold leading-tight">{p.nome}</div>
                                  <div className="font-mono text-xs text-muted-foreground">{p.codigo_interno ?? p.projeto_id}</div>
                                </div>
                              </div>
                              {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {p.codigo_protocolo && (
                                <Badge variant="outline" className="text-[10px]">{p.codigo_protocolo}</Badge>
                              )}
                              <Badge className={p.ativo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted"}>
                                {p.ativo ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.colaboradores} colaborador(es) · {p.ausencias} ausência(s) · {p.protocolos} protocolo(s)
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Cadastrado em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                            </div>
                            <div className="mt-auto inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm">
                              {selected ? "Projeto selecionado" : "Usar este projeto"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      {semelhantes.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Projetos semelhantes na empresa <b>{g.empresa_nome}</b>:{" "}
                          {semelhantes.slice(0, 6).map((s) => s.nome).join(", ")}
                          {semelhantes.length > 6 ? "…" : ""}
                        </p>
                      )}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Label className="text-xs text-muted-foreground sm:w-40">
                          Selecionar projeto correto:
                        </Label>
                        <Select
                          value={resolucoes[g.key] ?? ""}
                          onValueChange={(v) => setResolucao(g.key, v)}
                        >
                          <SelectTrigger className="w-full sm:max-w-md">
                            <SelectValue placeholder="Escolha um projeto desta empresa…" />
                          </SelectTrigger>
                          <SelectContent>
                            {opts.length === 0 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground">
                                Nenhum projeto ativo nesta empresa.
                              </div>
                            )}
                            {opts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Aplica-se às linhas: {g.linhas.slice(0, 12).join(", ")}
                    {g.linhas.length > 12 ? ` … (+${g.linhas.length - 12})` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}


      {rows.length > 0 && (
        <>
          {summary.err === 0 && (
            <Alert className="border-emerald-500/40 bg-emerald-500/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle>Validação concluída sem erros</AlertTitle>
              <AlertDescription>
                Todas as ambiguidades pendentes foram resolvidas e os <code className="rounded bg-muted px-1">projeto_id</code>s selecionados estão aplicados às linhas válidas.
              </AlertDescription>
            </Alert>
          )}

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
                disabled={!canImport || importar.isPending || summary.ok + (atualizar ? summary.dup : 0) === 0 || (headerDiag ? headerDiag.faltando.length > 0 || suspectUnmappedSupervisorEmail(headerDiag) : false)}
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
                      <TableCell className="text-sm">
                        <div className="flex flex-col gap-0.5">
                          <span>{r.projeto || "—"}</span>
                          {r.projeto_por_normalizacao && r.projeto_localizado_nome && (
                            <span
                              className="text-[11px] text-emerald-600 dark:text-emerald-400"
                              title="Localizado após normalizar espaços, acentos e hífens."
                            >
                              ↳ Localizado: {r.projeto_localizado_nome}
                            </span>
                          )}
                        </div>
                      </TableCell>
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
                      <TableCell className="text-xs text-muted-foreground">
                        {r.status === "ERRO" ? (
                          <div className="flex flex-wrap gap-1">
                            {r.erros.map((e, i) => (
                              <Badge
                                key={`${r.linha}-${i}`}
                                variant="outline"
                                className="border-red-400/40 bg-red-500/5 text-red-600 dark:text-red-400"
                              >
                                {e.msg}
                              </Badge>
                            ))}
                          </div>
                        ) : r.status === "DUPLICADA" ? (
                          "Já existe (atualizar ou ignorar)"
                        ) : (
                          "OK"
                        )}
                      </TableCell>
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
