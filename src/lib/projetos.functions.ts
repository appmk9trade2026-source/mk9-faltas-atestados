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
// Preview e Confirm compartilham a mesma pipeline de validação. Nunca
// confiamos no que o front decidiu — validamos tudo do zero no backend.

export type ProjetoImportRow = {
  linha: number;
  cnpj_empresa: string;
  codigo_projeto: string;
  nome_projeto: string;
  status: string;
  descricao?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  observacoes?: string | null;
};

export type ProjetoImportAcao =
  | "CRIAR" | "ATUALIZAR" | "ATIVAR" | "DESATIVAR" | "SEM_ALTERACAO" | "ERRO";

export type ProjetoImportPreviewRow = {
  linha: number;
  cnpj_normalizado: string;
  cnpj_original: string;
  codigo_normalizado: string;
  nome_projeto: string;
  status_normalizado: "ATIVO" | "INATIVO" | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  projeto_id: string | null;
  acao: ProjetoImportAcao;
  erros: string[];
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
  cnpj_empresa: z.string().max(30),
  codigo_projeto: z.string().max(30),
  nome_projeto: z.string().max(200),
  status: z.string().max(20),
  descricao: z.string().max(500).nullable().optional(),
  data_inicio: z.string().max(30).nullable().optional(),
  data_fim: z.string().max(30).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

const importInputSchema = z.object({
  arquivo_nome: z.string().trim().min(1).max(255).optional(),
  arquivo_tamanho: z.number().int().min(0).max(10 * 1024 * 1024).optional(),
  rows: z.array(importRowSchema).min(1).max(2000),
});

const confirmInputSchema = importInputSchema.extend({
  correlation_id: z.string().uuid().optional(),
});

function normalizeCnpj(v: string): string {
  return (v ?? "").replace(/\D+/g, "");
}
function normalizeCodigoProjeto(v: string): string {
  return (v ?? "").trim().toUpperCase();
}
function normalizeStatus(v: string): "ATIVO" | "INATIVO" | null {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "ATIVO" || s === "1" || s === "ATIVA" || s === "TRUE") return "ATIVO";
  if (s === "INATIVO" || s === "0" || s === "INATIVA" || s === "FALSE") return "INATIVO";
  return null;
}
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
function validCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string, pesos: number[]) => {
    const sum = base.split("").reduce((a, d, i) => a + Number(d) * pesos[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const d1 = calc(cnpj.slice(0, 12), p1);
  const d2 = calc(cnpj.slice(0, 12) + String(d1), p2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

async function buildPreview(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  correlationId: string,
  rows: z.infer<typeof importRowSchema>[],
): Promise<ProjetoImportPreview> {
  // Prepara os CNPJs distintos → localiza as empresas em UMA consulta (RLS scoped).
  const cnpjsRaw = new Set<string>();
  for (const r of rows) cnpjsRaw.add(normalizeCnpj(r.cnpj_empresa));
  const cnpjs = [...cnpjsRaw].filter((c) => c.length === 14);

  const empresasMap = new Map<string, { id: string; nome: string; ativo: boolean }>();
  if (cnpjs.length > 0) {
    // Comparação com CNPJ normalizado (regex) em Postgres.
    const { data: emps } = await supabase
      .from("empresas")
      .select("id, nome, cnpj, ativo");
    for (const e of (emps ?? []) as Array<{ id: string; nome: string; cnpj: string | null; ativo: boolean }>) {
      const cn = normalizeCnpj(e.cnpj ?? "");
      if (cn.length === 14) empresasMap.set(cn, { id: e.id, nome: e.nome, ativo: e.ativo });
    }
  }

  // Localiza projetos existentes por empresa+codigo em UMA consulta.
  const empresaIds = new Set<string>();
  for (const c of cnpjs) {
    const emp = empresasMap.get(c);
    if (emp) empresaIds.add(emp.id);
  }
  const projetoKey = new Map<string, { id: string; ativo: boolean; nome: string }>();
  if (empresaIds.size > 0) {
    const { data: projs } = await supabase
      .from("projetos")
      .select("id, empresa_id, codigo_protocolo, nome, ativo")
      .in("empresa_id", [...empresaIds]);
    for (const p of (projs ?? []) as Array<{ id: string; empresa_id: string; codigo_protocolo: string | null; nome: string; ativo: boolean }>) {
      if (p.codigo_protocolo) {
        projetoKey.set(`${p.empresa_id}::${p.codigo_protocolo.toUpperCase()}`,
          { id: p.id, ativo: p.ativo, nome: p.nome });
      }
    }
  }

  // Detecta duplicidade dentro do próprio arquivo (empresa+codigo).
  const arquivoKeyCount = new Map<string, number[]>();
  for (const r of rows) {
    const cn = normalizeCnpj(r.cnpj_empresa);
    const cod = normalizeCodigoProjeto(r.codigo_projeto);
    if (cn && cod) {
      const k = `${cn}::${cod}`;
      const arr = arquivoKeyCount.get(k) ?? [];
      arr.push(r.linha);
      arquivoKeyCount.set(k, arr);
    }
  }

  const linhas: ProjetoImportPreviewRow[] = rows.map((r) => {
    const cnNorm = normalizeCnpj(r.cnpj_empresa);
    const codNorm = normalizeCodigoProjeto(r.codigo_projeto);
    const nome = (r.nome_projeto ?? "").trim();
    const status = normalizeStatus(r.status);
    const dtIni = normalizeDate(r.data_inicio ?? null);
    const dtFim = normalizeDate(r.data_fim ?? null);
    const erros: string[] = [];

    if (!cnNorm) erros.push("CNPJ obrigatório");
    else if (cnNorm.length !== 14) erros.push("CNPJ deve ter 14 dígitos");
    else if (!validCnpj(cnNorm)) erros.push("CNPJ inválido");

    if (!codNorm) erros.push("codigo_projeto obrigatório");
    else if (!/^[A-Z0-9]{2,10}$/.test(codNorm))
      erros.push("codigo_projeto deve conter 2-10 caracteres A-Z/0-9");

    if (!nome) erros.push("nome_projeto obrigatório");
    if (nome.length > 120) erros.push("nome_projeto acima de 120 caracteres");

    if (!status) erros.push("status inválido (use ATIVO ou INATIVO)");

    if (dtIni === "INVALID") erros.push("data_inicio inválida (use YYYY-MM-DD)");
    if (dtFim === "INVALID") erros.push("data_fim inválida (use YYYY-MM-DD)");
    if (dtIni && dtFim && dtIni !== "INVALID" && dtFim !== "INVALID" && (dtFim as string) < (dtIni as string))
      erros.push("data_fim anterior a data_inicio");

    const emp = cnNorm && cnNorm.length === 14 ? empresasMap.get(cnNorm) : undefined;
    if (!emp && cnNorm.length === 14 && validCnpj(cnNorm))
      erros.push("empresa não encontrada ou fora do seu escopo");
    else if (emp && !emp.ativo) erros.push("empresa está inativa");

    // Duplicidade no próprio arquivo
    if (cnNorm && codNorm) {
      const dup = arquivoKeyCount.get(`${cnNorm}::${codNorm}`) ?? [];
      if (dup.length > 1) {
        erros.push(`linha duplicada no arquivo (linhas: ${dup.join(", ")})`);
      }
    }

    let acao: ProjetoImportAcao = "ERRO";
    let projetoId: string | null = null;

    if (erros.length === 0 && emp && status) {
      const key = `${emp.id}::${codNorm}`;
      const existing = projetoKey.get(key);
      projetoId = existing?.id ?? null;
      const wantAtivo = status === "ATIVO";
      if (!existing) acao = "CRIAR";
      else {
        // Detecta mudança de status vs alteração de campos
        const statusMudou = existing.ativo !== wantAtivo;
        const nomeMudou = existing.nome !== nome;
        const dadosMudaram = nomeMudou || r.descricao != null || dtIni || dtFim || r.observacoes != null;
        if (statusMudou && !dadosMudaram) acao = wantAtivo ? "ATIVAR" : "DESATIVAR";
        else if (statusMudou || dadosMudaram) acao = "ATUALIZAR";
        else acao = "SEM_ALTERACAO";
      }
    }

    return {
      linha: r.linha,
      cnpj_normalizado: cnNorm,
      cnpj_original: r.cnpj_empresa,
      codigo_normalizado: codNorm,
      nome_projeto: nome,
      status_normalizado: status,
      empresa_id: emp?.id ?? null,
      empresa_nome: emp?.nome ?? null,
      projeto_id: projetoId,
      acao,
      erros,
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
    // Preview exige pelo menos permissão de leitura+algo de escrita.
    await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.viewReport,
      route: "/configuracoes/projetos/importar",
    }).catch(async () => {
      // fallback: precisa poder criar OU editar projeto
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.createProject,
        route: "/configuracoes/projetos/importar",
      });
    });
    const correlationId = crypto.randomUUID();
    return buildPreview(context.supabase, correlationId, data.rows);
  });

export const confirmProjetosImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return confirmInputSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const correlationId = data.correlation_id ?? crypto.randomUUID();

    // Auditoria de início
    await audit(context.supabase, "PROJETOS_IMPORTACAO_INICIADA", null, correlationId,
      null,
      { arquivo: data.arquivo_nome ?? null, tamanho: data.arquivo_tamanho ?? null, total: data.rows.length },
      `importação de ${data.rows.length} linha(s)`, null, null);

    // Revalida do zero (nunca confiar na prévia do frontend)
    const preview = await buildPreview(context.supabase, correlationId, data.rows);

    const precisaCriar = preview.criar > 0;
    const precisaEditar = preview.atualizar + preview.ativar + preview.desativar > 0;

    // Gate de permissões — se falta qualquer permissão exigida, bloqueia tudo.
    if (precisaCriar) {
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.createProject,
        route: "/configuracoes/projetos/importar",
        correlationId,
      });
    }
    if (precisaEditar) {
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.updateProject,
        route: "/configuracoes/projetos/importar",
        correlationId,
      });
    }

    if (preview.erro > 0) {
      await audit(context.supabase, "PROJETOS_IMPORTACAO_FALHOU", null, correlationId,
        null, { erros: preview.erro, total: preview.total },
        `bloqueado — ${preview.erro} linha(s) com erro`, null, null, false);
      throw new Error(`INVALID_PAYLOAD: ${preview.erro} linha(s) contêm erros — corrija antes de confirmar`);
    }

    let criadas = 0, atualizadas = 0, ativadas = 0, desativadas = 0, ignoradas = 0;
    const falhas: Array<{ linha: number; erro: string }> = [];

    for (const l of preview.linhas) {
      try {
        if (l.acao === "SEM_ALTERACAO") { ignoradas++; continue; }
        if (!l.empresa_id) continue;
        const src = data.rows.find((r) => r.linha === l.linha)!;
        const dtIni = normalizeDate(src.data_inicio ?? null);
        const dtFim = normalizeDate(src.data_fim ?? null);
        const descricao = src.descricao?.trim() ? src.descricao.trim() : null;
        const observacoes = src.observacoes?.trim() ? src.observacoes.trim() : null;
        const wantAtivo = l.status_normalizado === "ATIVO";

        if (l.acao === "CRIAR") {
          const payload = {
            empresa_id: l.empresa_id,
            nome: l.nome_projeto,
            descricao,
            codigo_protocolo: l.codigo_normalizado,
            ativo: wantAtivo,
            data_inicio: dtIni === "INVALID" ? null : dtIni,
            data_fim: dtFim === "INVALID" ? null : dtFim,
            observacoes,
          };
          const { data: row, error } = await context.supabase
            .from("projetos")
            .insert(payload as never)
            .select("id")
            .single();
          if (error) throw mapSupabaseError(error.message);
          criadas++;
          await audit(context.supabase, "PROJETO_CRIADO", row.id as string, correlationId,
            null, payload, `import linha ${l.linha}`, l.empresa_id, row.id as string);
        } else if (l.projeto_id) {
          // Nunca alterar empresa de projeto existente nem codigo_protocolo histórico.
          const payload: Record<string, unknown> = {
            nome: l.nome_projeto,
            ativo: wantAtivo,
          };
          if (descricao !== null) payload.descricao = descricao;
          if (dtIni !== "INVALID" && dtIni !== null) payload.data_inicio = dtIni;
          if (dtFim !== "INVALID" && dtFim !== null) payload.data_fim = dtFim;
          if (observacoes !== null) payload.observacoes = observacoes;

          const { error } = await context.supabase
            .from("projetos")
            .update(payload as never)
            .eq("id", l.projeto_id);
          if (error) throw mapSupabaseError(error.message);

          if (l.acao === "ATIVAR") {
            ativadas++;
            await audit(context.supabase, "PROJETO_ATIVADO", l.projeto_id, correlationId,
              null, { ativo: true }, `import linha ${l.linha}`, l.empresa_id, l.projeto_id);
          } else if (l.acao === "DESATIVAR") {
            desativadas++;
            await audit(context.supabase, "PROJETO_DESATIVADO", l.projeto_id, correlationId,
              null, { ativo: false }, `import linha ${l.linha}`, l.empresa_id, l.projeto_id);
          } else {
            atualizadas++;
            await audit(context.supabase, "PROJETO_ATUALIZADO", l.projeto_id, correlationId,
              null, payload, `import linha ${l.linha}`, l.empresa_id, l.projeto_id);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        falhas.push({ linha: l.linha, erro: msg });
      }
    }

    const status = falhas.length === 0 ? "PROJETOS_IMPORTACAO_CONCLUIDA" : "PROJETOS_IMPORTACAO_FALHOU";
    await audit(context.supabase, status, null, correlationId,
      null,
      { criadas, atualizadas, ativadas, desativadas, ignoradas, falhas: falhas.length, total: preview.total },
      falhas.length === 0
        ? `concluída`
        : `parcial — ${falhas.length} falha(s): ${falhas.slice(0, 3).map((f) => `L${f.linha}`).join(", ")}`,
      null, null, falhas.length === 0);

    return {
      correlation_id: correlationId,
      total: preview.total,
      criadas,
      atualizadas,
      ativadas,
      desativadas,
      ignoradas,
      falhas,
    };
  });
