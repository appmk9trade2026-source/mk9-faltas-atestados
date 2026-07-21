// Projetos — Server Functions com hardening RBAC Fase 3 (Onda 2)
// + Importação por planilha (previewProjetosImport / confirmProjetosImport).
//
// Regra imutável: projetos NUNCA são excluídos. Encerrar = desativar.
// Empresa localizada apenas por CNPJ (nunca por nome, nunca por empresa_id
// enviado pelo cliente). Chave lógica do projeto: empresa_id + codigo_projeto.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";

const uuid = z.string().uuid();

const codigoSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v === "" || /^[A-Z0-9]{2,10}$/.test(v), {
    message: "Código deve conter 2-10 caracteres A-Z/0-9",
  });

const dateSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v as string), {
    message: "Data deve estar no formato YYYY-MM-DD",
  });

const projetoBaseSchema = z.object({
  empresa_id: uuid,
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).nullable().optional(),
  codigo_protocolo: codigoSchema.optional().or(z.literal("")),
  ativo: z.boolean(),
  data_inicio: dateSchema,
  data_fim: dateSchema,
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

function invalidPayload(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
}

function mapSupabaseError(msg: string): Error {
  if (/row-level security|permission denied|not authorized/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso");
  }
  if (/projetos_codigo_protocolo_uidx/i.test(msg)) {
    return new Error("CONFLICT: código de protocolo já está em uso");
  }
  if (/projetos_codigo_protocolo_formato_chk/i.test(msg)) {
    return new Error("INVALID_PAYLOAD: código de protocolo inválido");
  }
  if (/projetos_datas_chk/i.test(msg)) {
    return new Error("INVALID_PAYLOAD: data_fim não pode ser anterior a data_inicio");
  }
  if (/projetos_empresa_nome_uidx|duplicate|unique/i.test(msg)) {
    return new Error("CONFLICT: já existe um projeto com este nome nesta empresa");
  }
  if (/empresa está inativa|empresa inativa/i.test(msg)) {
    return new Error("CONFLICT: a empresa selecionada está inativa");
  }
  return new Error(`CONFLICT: ${msg}`);
}

type AuditAcao =
  | "PROJETO_CRIADO"
  | "PROJETO_EDITADO"
  | "PROJETO_ATIVADO"
  | "PROJETO_DESATIVADO"
  | "PROJETO_CODIGO_ALTERADO"
  | "PROJETO_CODIGO_ALTERACAO_NEGADA"
  | "PROJETO_ATUALIZADO"
  | "PROJETOS_IMPORTACAO_INICIADA"
  | "PROJETOS_IMPORTACAO_CONCLUIDA"
  | "PROJETOS_IMPORTACAO_FALHOU";

async function audit(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  acao: AuditAcao,
  registroId: string | null,
  correlationId: string,
  antes: unknown,
  depois: unknown,
  observacoes: string,
  empresaId: string | null,
  projetoId: string | null,
  sucesso = true,
) {
  try {
    await supabase.rpc("log_audit_event", {
      _modulo: "projetos",
      _acao: acao as never,
      _entidade: "Projeto",
      _registro_id: registroId,
      _empresa_id: empresaId ?? null,
      _projeto_id: projetoId ?? null,
      _antes: (antes ?? null) as never,
      _depois: (depois ?? null) as never,
      _sucesso: sucesso,
      _observacoes: `[corr=${correlationId}] ${observacoes}`,
      _origem: "server",
    } as never);
  } catch { /* best-effort */ }
}

// ==================== CREATE ====================
export const createProjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return projetoBaseSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createProject,
      empresaId: data.empresa_id,
      route: "/configuracoes/projetos",
    });
    const codigo = (data.codigo_protocolo ?? "").trim().toUpperCase();
    const payload = {
      empresa_id: data.empresa_id,
      nome: data.nome.trim(),
      descricao: data.descricao?.trim() ? data.descricao.trim() : null,
      codigo_protocolo: codigo ? codigo : null,
      ativo: data.ativo,
      data_inicio: data.data_inicio ?? null,
      data_fim: data.data_fim ?? null,
      observacoes: data.observacoes?.trim() ? data.observacoes.trim() : null,
    };
    const { data: row, error } = await context.supabase
      .from("projetos")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw mapSupabaseError(error.message);
    await audit(context.supabase, "PROJETO_CRIADO", row.id as string, gate.correlationId,
      null, payload, "criação", data.empresa_id, row.id as string);
    return { id: row.id as string, correlation_id: gate.correlationId };
  });

// ==================== UPDATE ====================
const updateSchema = projetoBaseSchema.extend({ id: uuid });

export const updateProjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return updateSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current, error: loadErr } = await context.supabase
      .from("projetos")
      .select("id, empresa_id, nome, descricao, codigo_protocolo, ativo, data_inicio, data_fim, observacoes")
      .eq("id", data.id)
      .maybeSingle();
    if (loadErr) throw new Error(`RESOURCE_NOT_FOUND: ${loadErr.message}`);
    if (!current) throw new Error("RESOURCE_NOT_FOUND: projeto não encontrado");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateProject,
      projetoId: data.id,
      route: "/configuracoes/projetos",
    });
    if (data.empresa_id !== current.empresa_id) {
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.updateProject,
        empresaId: data.empresa_id,
        route: "/configuracoes/projetos",
        correlationId: gate.correlationId,
      });
    }

    const novoCodigo = (data.codigo_protocolo ?? "").trim().toUpperCase();
    const antigoCodigo = (current.codigo_protocolo as string | null) ?? "";
    const codigoMudou = (novoCodigo || null) !== (antigoCodigo || null);

    if (codigoMudou) {
      const { count } = await context.supabase
        .from("ausencias")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", data.id);
      if ((count ?? 0) > 0) {
        await audit(context.supabase, "PROJETO_CODIGO_ALTERACAO_NEGADA",
          data.id, gate.correlationId,
          { codigo_protocolo: antigoCodigo }, { codigo_protocolo: novoCodigo },
          `bloqueado: projeto possui ${count} ausência(s)`,
          current.empresa_id as string, data.id, false);
        throw new Error("CONFLICT: código de protocolo não pode ser alterado — projeto já possui ausências registradas");
      }
    }

    const payload = {
      empresa_id: data.empresa_id,
      nome: data.nome.trim(),
      descricao: data.descricao?.trim() ? data.descricao.trim() : null,
      codigo_protocolo: novoCodigo ? novoCodigo : null,
      ativo: data.ativo,
      data_inicio: data.data_inicio ?? null,
      data_fim: data.data_fim ?? null,
      observacoes: data.observacoes?.trim() ? data.observacoes.trim() : null,
    };
    const { error } = await context.supabase
      .from("projetos")
      .update(payload as never)
      .eq("id", data.id);
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase, "PROJETO_EDITADO", data.id, gate.correlationId,
      current, payload, "edição", data.empresa_id, data.id);
    if (codigoMudou) {
      await audit(context.supabase, "PROJETO_CODIGO_ALTERADO", data.id, gate.correlationId,
        { codigo_protocolo: antigoCodigo }, { codigo_protocolo: novoCodigo },
        `código alterado sem ausências vinculadas`,
        data.empresa_id, data.id);
    }
    return { ok: true, correlation_id: gate.correlationId };
  });

// ==================== TOGGLE ATIVO ====================
export const setProjetoAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return z.object({ id: uuid, ativo: z.boolean() }).parse(data);
    } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("projetos")
      .select("id, empresa_id, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("RESOURCE_NOT_FOUND: projeto não encontrado");
    if (current.ativo === data.ativo) throw new Error("CONFLICT: status já é o solicitado");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateProject,
      projetoId: data.id,
      route: "/configuracoes/projetos",
    });

    const { error } = await context.supabase
      .from("projetos")
      .update({ ativo: data.ativo } as never)
      .eq("id", data.id);
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase,
      data.ativo ? "PROJETO_ATIVADO" : "PROJETO_DESATIVADO",
      data.id, gate.correlationId,
      { ativo: current.ativo }, { ativo: data.ativo },
      `status alterado`,
      current.empresa_id as string, data.id);
    return { ok: true, correlation_id: gate.correlationId };
  });

// ==================== IMPORTAÇÃO POR PLANILHA ====================
//
// Modelo: 6 colunas — Projeto, Empresa, Código, Descrição, Status,
// Data cadastro. Empresa é localizada por nome (case-insensitive, trim).
// Nunca confiamos em empresa_id / projeto_id enviados pelo cliente.

export type ProjetoImportRow = {
  linha: number;
  empresa_nome: string;
  codigo_projeto: string;
  nome_projeto: string;
  descricao?: string | null;
  status: string;
  data_cadastro?: string | null;
};

export type ProjetoImportAcao =
  | "CRIAR" | "ATUALIZAR" | "ATIVAR" | "DESATIVAR" | "SEM_ALTERACAO" | "ERRO";

export type ProjetoImportFieldDiff = {
  campo: "nome_projeto" | "status" | "descricao";
  atual: string | null;
  novo: string | null;
};

export type ProjetoImportPreviewRow = {
  linha: number;
  empresa_original: string;
  empresa_nome: string | null;
  empresa_id: string | null;
  codigo_normalizado: string;
  nome_projeto: string;
  descricao: string | null;
  status_normalizado: "ATIVO" | "INATIVO" | null;
  data_cadastro: string | null;
  projeto_id: string | null;
  acao: ProjetoImportAcao;
  erros: string[];
  diff: ProjetoImportFieldDiff[];
};

export type ProjetoImportPreview = {
  correlation_id: string;
  total: number;
  criar: number;
  atualizar: number;
  ativar: number;
  desativar: number;
  sem_alteracao: number;
  erro: number;
  empresas_envolvidas: number;
  linhas: ProjetoImportPreviewRow[];
};

const importRowSchema = z.object({
  linha: z.number().int().min(1),
  empresa_nome: z.string().max(200),
  codigo_projeto: z.string().max(30),
  nome_projeto: z.string().max(200),
  descricao: z.string().max(500).nullable().optional(),
  status: z.string().max(20),
  data_cadastro: z.string().max(30).nullable().optional(),
});

const importInputSchema = z.object({
  arquivo_nome: z.string().trim().min(1).max(255).optional(),
  arquivo_tamanho: z.number().int().min(0).max(10 * 1024 * 1024).optional(),
  rows: z.array(importRowSchema).min(1).max(2000),
});

const confirmInputSchema = importInputSchema.extend({
  correlation_id: z.string().uuid().optional(),
});

function normalizeEmpresaNome(v: string): string {
  return (v ?? "").trim().toLowerCase();
}
function normalizeCodigoProjeto(v: string): string {
  return (v ?? "").trim().toUpperCase();
}
/** Normaliza nome do projeto para COMPARAÇÃO (case-insensitive, espaços colapsados). */
function normalizeNomeProjeto(v: string): string {
  return (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
function normalizeStatus(v: string): "ATIVO" | "INATIVO" | null {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "ATIVO" || s === "1" || s === "ATIVA" || s === "TRUE") return "ATIVO";
  if (s === "INATIVO" || s === "0" || s === "INATIVA" || s === "FALSE") return "INATIVO";
  return null;
}
/**
 * O cliente já normaliza a data via parseSpreadsheetDate (serial Excel, Date,
 * DD/MM/YYYY, YYYY-MM-DD, ISO). Aqui aceitamos YYYY-MM-DD ou DD/MM/YYYY.
 */
function normalizeDate(v: string | null | undefined): string | null | "INVALID" {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "INVALID";
}

async function buildPreview(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  correlationId: string,
  rows: z.infer<typeof importRowSchema>[],
): Promise<ProjetoImportPreview> {
  // Localiza empresas por nome normalizado (case-insensitive). Detecta ambiguidade.
  const empresasBucket = new Map<string, Array<{ id: string; nome: string; ativo: boolean }>>();
  const { data: emps } = await supabase.from("empresas").select("id, nome, ativo");
  for (const e of (emps ?? []) as Array<{ id: string; nome: string; ativo: boolean }>) {
    const key = normalizeEmpresaNome(e.nome);
    if (!key) continue;
    const arr = empresasBucket.get(key) ?? [];
    arr.push({ id: e.id, nome: e.nome, ativo: e.ativo });
    empresasBucket.set(key, arr);
  }

  // Projetos existentes por empresa+codigo
  const empresaIds = new Set<string>();
  for (const r of rows) {
    const key = normalizeEmpresaNome(r.empresa_nome);
    const bucket = empresasBucket.get(key);
    if (bucket && bucket.length === 1) empresaIds.add(bucket[0].id);
  }
  type ExistingProjeto = {
    id: string; ativo: boolean; nome: string; descricao: string | null;
  };
  const projetoKey = new Map<string, ExistingProjeto>();
  if (empresaIds.size > 0) {
    const { data: projs } = await supabase
      .from("projetos")
      .select("id, empresa_id, codigo_protocolo, nome, ativo, descricao")
      .in("empresa_id", [...empresaIds]);
    for (const p of (projs ?? []) as Array<{
      id: string; empresa_id: string; codigo_protocolo: string | null;
      nome: string; ativo: boolean; descricao: string | null;
    }>) {
      if (p.codigo_protocolo) {
        projetoKey.set(`${p.empresa_id}::${p.codigo_protocolo.toUpperCase()}`, {
          id: p.id, ativo: p.ativo, nome: p.nome, descricao: p.descricao,
        });
      }
    }
  }

  // Duplicidade dentro do próprio arquivo (empresa_norm + codigo)
  const arquivoKeyCount = new Map<string, number[]>();
  for (const r of rows) {
    const en = normalizeEmpresaNome(r.empresa_nome);
    const cod = normalizeCodigoProjeto(r.codigo_projeto);
    if (en && cod) {
      const k = `${en}::${cod}`;
      const arr = arquivoKeyCount.get(k) ?? [];
      arr.push(r.linha);
      arquivoKeyCount.set(k, arr);
    }
  }

  const nullIfBlank = (v: string | null | undefined): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const linhas: ProjetoImportPreviewRow[] = rows.map((r) => {
    const enNorm = normalizeEmpresaNome(r.empresa_nome);
    const codNorm = normalizeCodigoProjeto(r.codigo_projeto);
    const nome = (r.nome_projeto ?? "").trim();
    const descricao = nullIfBlank(r.descricao);
    const status = normalizeStatus(r.status);
    const dtCad = normalizeDate(r.data_cadastro ?? null);
    const erros: string[] = [];

    if (!enNorm) erros.push("Empresa obrigatória");
    if (!codNorm) erros.push("Código obrigatório");
    else if (!/^[A-Z0-9]{2,10}$/.test(codNorm))
      erros.push("Código deve conter 2-10 caracteres A-Z/0-9");
    if (!nome) erros.push("Projeto (nome) obrigatório");
    if (nome.length > 120) erros.push("Projeto acima de 120 caracteres");
    if (!status) erros.push("Status inválido (use ATIVO ou INATIVO)");
    if (dtCad === "INVALID") erros.push("Data cadastro inválida (use DD/MM/YYYY ou YYYY-MM-DD)");

    const bucket = enNorm ? empresasBucket.get(enNorm) : undefined;
    let emp: { id: string; nome: string; ativo: boolean } | undefined;
    if (enNorm) {
      if (!bucket || bucket.length === 0) {
        erros.push("Empresa não encontrada ou fora do seu escopo");
      } else if (bucket.length > 1) {
        erros.push(`Empresa ambígua — ${bucket.length} cadastros com este nome`);
      } else {
        emp = bucket[0];
        if (!emp.ativo) erros.push("Empresa está inativa");
      }
    }

    if (enNorm && codNorm) {
      const dup = arquivoKeyCount.get(`${enNorm}::${codNorm}`) ?? [];
      if (dup.length > 1) erros.push(`Linha duplicada no arquivo (linhas: ${dup.join(", ")})`);
    }

    let acao: ProjetoImportAcao = "ERRO";
    let projetoId: string | null = null;
    const diff: ProjetoImportFieldDiff[] = [];

    if (erros.length === 0 && emp && status) {
      const key = `${emp.id}::${codNorm}`;
      const existing = projetoKey.get(key);
      projetoId = existing?.id ?? null;
      const wantAtivo = status === "ATIVO";
      if (!existing) {
        acao = "CRIAR";
      } else {
        const atualStatus = existing.ativo ? "ATIVO" : "INATIVO";
        const novoStatus: "ATIVO" | "INATIVO" = wantAtivo ? "ATIVO" : "INATIVO";

        if (existing.nome !== nome)
          diff.push({ campo: "nome_projeto", atual: existing.nome, novo: nome });
        if (atualStatus !== novoStatus)
          diff.push({ campo: "status", atual: atualStatus, novo: novoStatus });
        if ((existing.descricao ?? null) !== descricao)
          diff.push({ campo: "descricao", atual: existing.descricao, novo: descricao });

        const statusMudou = atualStatus !== novoStatus;
        const outrosMudaram = diff.some((d) => d.campo !== "status");
        if (!statusMudou && !outrosMudaram) acao = "SEM_ALTERACAO";
        else if (statusMudou && !outrosMudaram) acao = wantAtivo ? "ATIVAR" : "DESATIVAR";
        else acao = "ATUALIZAR";
      }
    }

    return {
      linha: r.linha,
      empresa_original: r.empresa_nome,
      empresa_nome: emp?.nome ?? null,
      empresa_id: emp?.id ?? null,
      codigo_normalizado: codNorm,
      nome_projeto: nome,
      descricao,
      status_normalizado: status,
      data_cadastro: typeof dtCad === "string" ? dtCad : null,
      projeto_id: projetoId,
      acao,
      erros,
      diff,
    };
  });

  const contar = (a: ProjetoImportAcao) => linhas.filter((l) => l.acao === a).length;
  return {
    correlation_id: correlationId,
    total: linhas.length,
    criar: contar("CRIAR"),
    atualizar: contar("ATUALIZAR"),
    ativar: contar("ATIVAR"),
    desativar: contar("DESATIVAR"),
    sem_alteracao: contar("SEM_ALTERACAO"),
    erro: contar("ERRO"),
    empresas_envolvidas: new Set(linhas.map((l) => l.empresa_id).filter(Boolean)).size,
    linhas,
  };
}

export const previewProjetosImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return importInputSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.viewReport,
      route: "/configuracoes/projetos/importar",
    }).catch(async () => {
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.createProject,
        route: "/configuracoes/projetos/importar",
      });
    });
    const correlationId = crypto.randomUUID();
    return buildPreview(context.supabase, correlationId, data.rows);
  });

/** Confirmação atômica via RPC transacional import_projetos_atomic. */
export const confirmProjetosImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return confirmInputSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const correlationId = data.correlation_id ?? crypto.randomUUID();

    await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createProject,
      route: "/configuracoes/projetos/importar",
      correlationId,
    }).catch(async () => {
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.updateProject,
        route: "/configuracoes/projetos/importar",
        correlationId,
      });
    });

    const rowsJson = data.rows.map((r) => ({
      row_number: r.linha,
      empresa_nome: r.empresa_nome,
      codigo_projeto: r.codigo_projeto,
      nome_projeto: r.nome_projeto,
      descricao: r.descricao ?? null,
      status: r.status,
      data_cadastro: r.data_cadastro ?? null,
    }));

    type AtomicResult = {
      success: boolean;
      correlation_id: string;
      total: number;
      created: number;
      updated: number;
      activated: number;
      deactivated: number;
      unchanged: number;
      rejected: number;
      errors: Array<{ row_number: number; field: string; code: string; message: string }>;
      duration_ms: number;
    };

    let rpcResult: AtomicResult | null = null;
    let rpcErrorMessage: string | null = null;
    let rpcErrorCode: string | null = null;
    let rpcErrorDetails: string | null = null;
    type FailurePhase = "rpc_call" | "rpc_validation" | "rpc_write" | "unknown";
    let failurePhase: FailurePhase = "unknown";
    const startedAt = Date.now();

    try {
      const { data: out, error } = await context.supabase.rpc(
        "import_projetos_atomic" as never,
        { _rows: rowsJson as never, _correlation_id: correlationId as never } as never,
      );
      if (error) {
        rpcErrorMessage = error.message ?? String(error);
        rpcErrorCode = (error as { code?: string }).code ?? null;
        rpcErrorDetails = (error as { details?: string }).details ?? null;
      } else {
        rpcResult = out as unknown as AtomicResult;
      }
    } catch (err) {
      rpcErrorMessage = err instanceof Error ? err.message : String(err);
      rpcErrorCode = (err as { code?: string })?.code ?? null;
      rpcErrorDetails = (err as { details?: string })?.details ?? null;
    }

    if (rpcErrorMessage || !rpcResult) {
      let userCode:
        | "IMPORT_CONFLICT"
        | "IMPORT_CONCURRENT_CHANGE"
        | "IMPORT_TEMPORARILY_UNAVAILABLE"
        | "IMPORT_FAILED" = "IMPORT_FAILED";
      let userMessage =
        "Não foi possível concluir a importação. Nenhuma alteração foi aplicada.";
      let phase: FailurePhase = "rpc_call";
      const rawUpper = (rpcErrorMessage ?? "").toUpperCase();

      if (/^PERMISSION_DENIED/.test(rpcErrorMessage ?? "")) {
        await audit(context.supabase, "PROJETOS_IMPORTACAO_FALHOU", null, correlationId,
          null, { error_code: "PERMISSION_DENIED", failure_phase: "rpc_validation",
            duration_ms: Date.now() - startedAt, total_rows: data.rows.length,
            correlation_id: correlationId },
          "permissão negada", null, null, false);
        throw new Error("PERMISSION_DENIED: permissão negada para importar projetos");
      }
      if (/^INVALID_PAYLOAD/.test(rpcErrorMessage ?? "")) {
        await audit(context.supabase, "PROJETOS_IMPORTACAO_FALHOU", null, correlationId,
          null, { error_code: "INVALID_PAYLOAD", failure_phase: "rpc_validation",
            duration_ms: Date.now() - startedAt, total_rows: data.rows.length,
            correlation_id: correlationId },
          "payload inválido", null, null, false);
        throw new Error("INVALID_PAYLOAD: dados inválidos para importação");
      }

      if (rpcErrorCode === "23505" || /UNIQUE|DUPLICATE/.test(rawUpper)) {
        userCode = "IMPORT_CONFLICT";
        userMessage =
          "Outro usuário alterou ou importou um dos projetos durante esta operação. Nenhuma alteração foi aplicada. Valide novamente a planilha e tente de novo.";
        phase = "rpc_write";
      } else if (rpcErrorCode === "40001" || rpcErrorCode === "40P01") {
        userCode = "IMPORT_CONCURRENT_CHANGE";
        userMessage =
          "Houve concorrência de escrita no banco. Nenhuma alteração foi aplicada. Valide novamente e tente novamente.";
        phase = "rpc_write";
      } else if (rpcErrorCode === "55P03") {
        userCode = "IMPORT_TEMPORARILY_UNAVAILABLE";
        userMessage =
          "O sistema está momentaneamente ocupado. Nenhuma alteração foi aplicada. Aguarde alguns instantes e tente novamente.";
        phase = "rpc_write";
      }

      let conflictHint: { row_number?: number; codigo_projeto?: string; empresa_nome?: string } | undefined;
      if (userCode === "IMPORT_CONFLICT" && rpcErrorDetails) {
        const m = /\(codigo_protocolo\)=\(([^)]+)\)/i.exec(rpcErrorDetails);
        if (m) {
          const codigo = m[1].toUpperCase();
          const row = data.rows.find(
            (r) => (r.codigo_projeto ?? "").trim().toUpperCase() === codigo,
          );
          conflictHint = row
            ? { row_number: row.linha, codigo_projeto: codigo, empresa_nome: row.empresa_nome }
            : { codigo_projeto: codigo };
        }
      }

      failurePhase = phase;
      await audit(context.supabase, "PROJETOS_IMPORTACAO_FALHOU", null, correlationId,
        null, { error_code: userCode, failure_phase: failurePhase,
          duration_ms: Date.now() - startedAt, total_rows: data.rows.length,
          correlation_id: correlationId, conflict_hint: conflictHint ?? null },
        `${userCode} — importação abortada`, null, null, false);

      const err = new Error(`${userCode}: ${userMessage}`) as Error & {
        code: string; correlationId: string; conflictHint?: typeof conflictHint;
      };
      err.code = userCode;
      err.correlationId = correlationId;
      if (conflictHint) err.conflictHint = conflictHint;
      throw err;
    }

    if (!rpcResult.success) {
      await audit(context.supabase, "PROJETOS_IMPORTACAO_FALHOU", null, correlationId,
        null, { error_code: "IMPORT_VALIDATION", failure_phase: "rpc_validation",
          duration_ms: rpcResult.duration_ms, total_rows: rpcResult.total,
          correlation_id: correlationId, rejected: rpcResult.rejected,
          errors: rpcResult.errors.slice(0, 50) },
        `bloqueada — ${rpcResult.rejected} linha(s) com erro`, null, null, false);
    } else {
      const rps = rpcResult.duration_ms > 0
        ? Math.round((rpcResult.total * 1000) / rpcResult.duration_ms)
        : rpcResult.total;
      await audit(context.supabase, "PROJETOS_IMPORTACAO_CONCLUIDA", null, correlationId,
        null, { duration_ms: rpcResult.duration_ms, total_rows: rpcResult.total,
          rows_per_second: rps, created: rpcResult.created, updated: rpcResult.updated,
          activated: rpcResult.activated, deactivated: rpcResult.deactivated,
          unchanged: rpcResult.unchanged, correlation_id: correlationId },
        `importação concluída — ${rpcResult.total} linha(s) em ${rpcResult.duration_ms}ms`,
        null, null, true);
    }

    return {
      criadas: rpcResult.created,
      atualizadas: rpcResult.updated,
      ativadas: rpcResult.activated,
      desativadas: rpcResult.deactivated,
      ignoradas: rpcResult.unchanged,
      falhas: rpcResult.errors.map((e) => ({
        linha: e.row_number,
        erro: `${e.field}: ${e.message}`,
      })),
      success: rpcResult.success,
      correlation_id: rpcResult.correlation_id,
      total: rpcResult.total,
      rejected: rpcResult.rejected,
      duration_ms: rpcResult.duration_ms,
    };
  });



