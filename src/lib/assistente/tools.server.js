// Catálogo fechado de ferramentas do Assistente. Cada ferramenta possui:
// - inputSchema Zod que valida os parâmetros antes de chamar o banco;
// - allowedRoles, controle de acesso por perfil (interseção com o perfil do usuário);
// - execute(ctx, params) usando context.supabase (RLS aplicada como usuário);
// - maxRows / timeout para conter respostas grandes.
//
// A IA NUNCA pode chamar tabelas fora deste catálogo. Parâmetros fora do
// schema são rejeitados antes de qualquer chamada ao banco.
import { z } from "zod";
import { resolverPeriodo, periodoAnterior } from "./periodos.server";
const zPeriodo = z
    .object({
    preset: z
        .enum(["HOJE", "ONTEM", "ULTIMOS_7_DIAS", "MES_ATUAL", "MES_ANTERIOR", "PERSONALIZADO"])
        .default("HOJE"),
    inicio: z.string().datetime().optional(),
    fim: z.string().datetime().optional(),
})
    .optional();
function zToJson(schema) {
    // JSON Schema simplificado — o gateway não exige schema estrito; apenas
    // uma descrição suficiente. Aqui geramos os campos principais.
    const props = {};
    const required = [];
    for (const [k, v] of Object.entries(schema.shape)) {
        const def = v._def;
        const typeName = def?.typeName;
        props[k] = { description: v.description ?? "" };
        if (!(typeName === "ZodOptional" || typeName === "ZodDefault"))
            required.push(k);
    }
    return { type: "object", properties: props, required, additionalProperties: false };
}
// --------------- Tool 1: resumo operacional ---------------
const resumoInput = z.object({
    periodo: zPeriodo,
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
});
const obterResumoOperacional = {
    name: "obter_resumo_operacional",
    description: "Agrega ausências, alertas e mensagens WhatsApp de um período. Retorna totais e projetos com maior volume.",
    inputSchema: resumoInput,
    jsonSchema: zToJson(resumoInput),
    allowedRoles: "*",
    maxRows: 10,
    timeoutMs: 15000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        const [aus, ale, wa] = await Promise.all([
            supabase
                .from("ausencias")
                .select("id, tipo, status, dias, empresa_id, projeto_id, criado_em")
                .gte("criado_em", p.inicio)
                .lte("criado_em", p.fim)
                .limit(1000),
            supabase
                .from("alertas")
                .select("id, severidade, status, empresa_id, projeto_id, criado_em")
                .gte("criado_em", p.inicio)
                .lte("criado_em", p.fim)
                .limit(1000),
            supabase
                .from("whatsapp_outbox")
                .select("id, status, criado_em")
                .gte("criado_em", p.inicio)
                .lte("criado_em", p.fim)
                .limit(1000),
        ]);
        const ausData = aus.data ?? [];
        const aleData = ale.data ?? [];
        const waData = wa.data ?? [];
        const projPorVolume = new Map();
        for (const a of ausData) {
            const k = String(a.projeto_id ?? "sem_projeto");
            projPorVolume.set(k, (projPorVolume.get(k) ?? 0) + 1);
        }
        const topProjetos = [...projPorVolume.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([projeto_id, total]) => ({ projeto_id, total }));
        return {
            periodo: p,
            totais: {
                ausencias: ausData.length,
                faltas: ausData.filter((a) => String(a.tipo ?? "").toUpperCase().includes("FALTA")).length,
                atestados: ausData.filter((a) => String(a.tipo ?? "").toUpperCase().includes("ATESTADO")).length,
                pendentes: ausData.filter((a) => a.status === "PENDENTE").length,
                lancados: ausData.filter((a) => a.status === "LANCADO").length,
            },
            alertas: {
                total: aleData.length,
                criticos: aleData.filter((a) => a.severidade === "CRITICA").length,
                abertos: aleData.filter((a) => a.status === "ABERTO").length,
            },
            whatsapp: {
                total: waData.length,
                enviadas: waData.filter((w) => w.status === "ENVIADA").length,
                entregues: waData.filter((w) => w.status === "ENTREGUE").length,
                falhas: waData.filter((w) => w.status === "FALHA" || w.status === "FALHOU").length,
            },
            top_projetos: topProjetos,
        };
    },
};
// --------------- Tool 2: consultar ausências ---------------
const ausenciasInput = z.object({
    periodo: zPeriodo,
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
    status: z.enum(["PENDENTE", "LANCADO", "CANCELADO"]).optional(),
    tipo: z.string().max(64).optional(),
    protocolo: z.string().max(64).optional(),
    limite: z.number().int().min(1).max(50).default(20),
});
const consultarAusencias = {
    name: "consultar_ausencias",
    description: "Lista ausências (faltas e atestados) filtradas por período, empresa, projeto, status, tipo ou protocolo. Máximo 50 registros. Não retorna CID/diagnóstico.",
    inputSchema: ausenciasInput,
    jsonSchema: zToJson(ausenciasInput),
    allowedRoles: ["super_admin", "rh", "supervisor", "compliance"],
    maxRows: 50,
    timeoutMs: 12000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        let q = supabase
            .from("ausencias")
            .select("id, protocolo, tipo, status, dias, data_inicio, data_fim, empresa_id, projeto_id, colaborador_id, criado_em")
            .gte("criado_em", p.inicio)
            .lte("criado_em", p.fim)
            .order("criado_em", { ascending: false })
            .limit(params.limite);
        if (params.empresa_id)
            q = q.eq("empresa_id", params.empresa_id);
        if (params.projeto_id)
            q = q.eq("projeto_id", params.projeto_id);
        if (params.status)
            q = q.eq("status", params.status);
        if (params.tipo)
            q = q.ilike("tipo", `%${params.tipo}%`);
        if (params.protocolo)
            q = q.ilike("protocolo", `%${params.protocolo}%`);
        const { data, error } = await q;
        if (error)
            throw new Error(error.message);
        return { periodo: p, total: data?.length ?? 0, registros: data ?? [] };
    },
};
// --------------- Tool 3: consultar alertas ---------------
const alertasInput = z.object({
    periodo: zPeriodo,
    status: z.enum(["ABERTO", "EM_ANDAMENTO", "RESOLVIDO", "IGNORADO"]).optional(),
    severidade: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
    limite: z.number().int().min(1).max(50).default(20),
});
const consultarAlertas = {
    name: "consultar_alertas",
    description: "Lista alertas operacionais. Filtros: período, status, severidade, empresa, projeto. Máximo 50.",
    inputSchema: alertasInput,
    jsonSchema: zToJson(alertasInput),
    allowedRoles: ["super_admin", "rh", "compliance"],
    maxRows: 50,
    timeoutMs: 12000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        let q = supabase
            .from("alertas")
            .select("id, tipo, severidade, status, titulo, empresa_id, projeto_id, criado_em, resolvido_em")
            .gte("criado_em", p.inicio)
            .lte("criado_em", p.fim)
            .order("criado_em", { ascending: false })
            .limit(params.limite);
        if (params.status)
            q = q.eq("status", params.status);
        if (params.severidade)
            q = q.eq("severidade", params.severidade);
        if (params.empresa_id)
            q = q.eq("empresa_id", params.empresa_id);
        if (params.projeto_id)
            q = q.eq("projeto_id", params.projeto_id);
        const { data, error } = await q;
        if (error)
            throw new Error(error.message);
        return { periodo: p, total: data?.length ?? 0, registros: data ?? [] };
    },
};
// --------------- Tool 4: consultar whatsapp ---------------
const whatsappInput = z.object({
    periodo: zPeriodo,
    status: z.enum(["PENDENTE", "ENVIADA", "ENTREGUE", "LIDA", "FALHA", "FALHOU"]).optional(),
    template_codigo: z.string().max(64).optional(),
    limite: z.number().int().min(1).max(50).default(20),
});
const consultarWhatsapp = {
    name: "consultar_whatsapp",
    description: "Lista mensagens WhatsApp da caixa de saída. Filtros: período, status, código do template. Máximo 50. Provider_message_id é omitido para não-super_admin.",
    inputSchema: whatsappInput,
    jsonSchema: zToJson(whatsappInput),
    allowedRoles: ["super_admin", "rh", "compliance"],
    maxRows: 50,
    timeoutMs: 12000,
    sensitivity: "operational",
    execute: async ({ supabase, roles }, params) => {
        const p = resolverPeriodo(params.periodo);
        let q = supabase
            .from("whatsapp_outbox")
            .select("id, template_codigo, status, tentativas, criado_em, enviado_em, entregue_em, ultimo_erro")
            .gte("criado_em", p.inicio)
            .lte("criado_em", p.fim)
            .order("criado_em", { ascending: false })
            .limit(params.limite);
        if (params.status)
            q = q.eq("status", params.status);
        if (params.template_codigo)
            q = q.eq("template_codigo", params.template_codigo);
        const { data, error } = await q;
        if (error)
            throw new Error(error.message);
        const isSuper = roles.includes("super_admin");
        const rows = (data ?? []).map((r) => isSuper ? r : { ...r, ultimo_erro: r.ultimo_erro ? "[oculto]" : null });
        return { periodo: p, total: rows.length, registros: rows };
    },
};
// --------------- Tool 5: consultar projetos ---------------
const projetosInput = z.object({
    periodo: zPeriodo,
    empresa_id: z.string().uuid().optional(),
});
const consultarProjetos = {
    name: "consultar_projetos",
    description: "Retorna métricas agregadas por projeto (total de ausências no período). Máximo 20 projetos.",
    inputSchema: projetosInput,
    jsonSchema: zToJson(projetosInput),
    allowedRoles: "*",
    maxRows: 20,
    timeoutMs: 12000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        const [pjRes, ausRes] = await Promise.all([
            supabase
                .from("projetos")
                .select("id, nome, codigo, empresa_id, ativo")
                .eq("ativo", true)
                .limit(200),
            supabase
                .from("ausencias")
                .select("projeto_id")
                .gte("criado_em", p.inicio)
                .lte("criado_em", p.fim)
                .limit(5000),
        ]);
        if (pjRes.error)
            throw new Error(pjRes.error.message);
        const counts = new Map();
        for (const r of ausRes.data ?? []) {
            const k = String(r.projeto_id ?? "");
            if (!k)
                continue;
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const rows = (pjRes.data ?? [])
            .filter((p2) => !params.empresa_id || p2.empresa_id === params.empresa_id)
            .map((p2) => ({ ...p2, total_ausencias: counts.get(p2.id) ?? 0 }))
            .sort((a, b) => b.total_ausencias - a.total_ausencias)
            .slice(0, 20);
        return { periodo: p, projetos: rows };
    },
};
// --------------- Tool 6: consultar colaboradores ---------------
const colabInput = z.object({
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
    apenas_ativos: z.boolean().default(true),
    sem_telefone_valido: z.boolean().default(false),
    limite: z.number().int().min(1).max(50).default(20),
});
const consultarColaboradores = {
    name: "consultar_colaboradores",
    description: "Lista colaboradores com dados operacionais apenas (nome, empresa, projeto, ativo, tem_telefone_valido). Nunca retorna CPF ou telefone completos.",
    inputSchema: colabInput,
    jsonSchema: zToJson(colabInput),
    allowedRoles: ["super_admin", "rh", "supervisor", "compliance"],
    maxRows: 50,
    timeoutMs: 10000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        let q = supabase
            .from("colaboradores")
            .select("id, nome, matricula, empresa_id, projeto_id, ativo, telefone_whatsapp")
            .order("nome", { ascending: true })
            .limit(params.limite);
        if (params.apenas_ativos)
            q = q.eq("ativo", true);
        if (params.empresa_id)
            q = q.eq("empresa_id", params.empresa_id);
        if (params.projeto_id)
            q = q.eq("projeto_id", params.projeto_id);
        const { data, error } = await q;
        if (error)
            throw new Error(error.message);
        let rows = (data ?? []).map((c) => {
            const digits = String(c.telefone_whatsapp ?? "").replace(/\D+/g, "");
            const telValido = digits.length >= 10;
            return {
                id: c.id,
                nome: c.nome,
                matricula: c.matricula,
                empresa_id: c.empresa_id,
                projeto_id: c.projeto_id,
                ativo: c.ativo,
                tem_telefone_valido: telValido,
            };
        });
        if (params.sem_telefone_valido)
            rows = rows.filter((r) => !r.tem_telefone_valido);
        return { total: rows.length, registros: rows };
    },
};
// --------------- Tool 7: comparar períodos ---------------
const compararInput = z.object({
    periodo: zPeriodo,
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
});
const compararPeriodos = {
    name: "comparar_periodos",
    description: "Compara faltas, atestados, alertas e WhatsApp entregues no período informado contra o período imediatamente anterior de mesma duração.",
    inputSchema: compararInput,
    jsonSchema: zToJson(compararInput),
    allowedRoles: "*",
    maxRows: 1,
    timeoutMs: 15000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        const anterior = periodoAnterior(p);
        async function totais(inicio, fim) {
            const [aus, ale, wa] = await Promise.all([
                supabase.from("ausencias").select("id, tipo, dias").gte("criado_em", inicio).lte("criado_em", fim).limit(5000),
                supabase.from("alertas").select("id, severidade").gte("criado_em", inicio).lte("criado_em", fim).limit(5000),
                supabase.from("whatsapp_outbox").select("id, status").gte("criado_em", inicio).lte("criado_em", fim).limit(5000),
            ]);
            const ausData = aus.data ?? [];
            return {
                ausencias: ausData.length,
                faltas: ausData.filter((a) => String(a.tipo ?? "").toUpperCase().includes("FALTA")).length,
                atestados: ausData.filter((a) => String(a.tipo ?? "").toUpperCase().includes("ATESTADO")).length,
                dias_ausencia: ausData.reduce((acc, a) => acc + Number(a.dias ?? 0), 0),
                alertas_criticos: (ale.data ?? []).filter((a) => a.severidade === "CRITICA").length,
                wa_entregues: (wa.data ?? []).filter((w) => w.status === "ENTREGUE").length,
            };
        }
        const atual = await totais(p.inicio, p.fim);
        const prev = await totais(anterior.inicio, anterior.fim);
        function delta(a, b) {
            const diff = a - b;
            const pct = b === 0 ? null : Math.round((diff / b) * 1000) / 10;
            return { atual: a, anterior: b, diferenca: diff, variacao_percentual: pct };
        }
        return {
            periodo_atual: p,
            periodo_anterior: anterior,
            metricas: {
                ausencias: delta(atual.ausencias, prev.ausencias),
                faltas: delta(atual.faltas, prev.faltas),
                atestados: delta(atual.atestados, prev.atestados),
                dias_ausencia: delta(atual.dias_ausencia, prev.dias_ausencia),
                alertas_criticos: delta(atual.alertas_criticos, prev.alertas_criticos),
                wa_entregues: delta(atual.wa_entregues, prev.wa_entregues),
            },
        };
    },
};
// --------------- Tool 8: consultar protocolos ---------------
const protoInput = z.object({
    protocolo: z.string().max(64).optional(),
    codigo_projeto: z.string().max(32).optional(),
    periodo: zPeriodo,
    limite: z.number().int().min(1).max(50).default(20),
});
const consultarProtocolos = {
    name: "consultar_protocolos",
    description: "Busca protocolos por código de projeto ou número de protocolo em um período. Máximo 50.",
    inputSchema: protoInput,
    jsonSchema: zToJson(protoInput),
    allowedRoles: ["super_admin", "rh", "supervisor", "compliance"],
    maxRows: 50,
    timeoutMs: 10000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        let q = supabase
            .from("ausencias")
            .select("id, protocolo, tipo, status, data_inicio, data_fim, projeto_id, criado_em")
            .not("protocolo", "is", null)
            .gte("criado_em", p.inicio)
            .lte("criado_em", p.fim)
            .order("criado_em", { ascending: false })
            .limit(params.limite);
        if (params.protocolo)
            q = q.ilike("protocolo", `%${params.protocolo}%`);
        if (params.codigo_projeto)
            q = q.ilike("protocolo", `${params.codigo_projeto.toUpperCase()}-%`);
        const { data, error } = await q;
        if (error)
            throw new Error(error.message);
        return { periodo: p, total: data?.length ?? 0, registros: data ?? [] };
    },
};
// --------------- Tool 9: relatório existente ---------------
const relatorioInput = z.object({
    relatorio: z.enum(["absenteismo", "faltas", "atestados", "licencas", "comunicacoes", "afastamentos_inss", "medidas_administrativas"]),
    periodo: zPeriodo,
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
});
const obterRelatorioExistente = {
    name: "obter_relatorio_existente",
    description: "Executa uma RPC de relatório oficial já homologada do CRM (rel_absenteismo, rel_faltas, rel_atestados, rel_licencas, rel_comunicacoes, rel_afastamentos_inss, rel_medidas_administrativas).",
    inputSchema: relatorioInput,
    jsonSchema: zToJson(relatorioInput),
    allowedRoles: ["super_admin", "rh", "compliance"],
    maxRows: 100,
    timeoutMs: 15000,
    sensitivity: "operational",
    execute: async ({ supabase }, params) => {
        const p = resolverPeriodo(params.periodo);
        const rpcName = `rel_${params.relatorio}`;
        const { data, error } = await supabase.rpc(rpcName, {
            _inicio: p.inicio,
            _fim: p.fim,
            _empresa_id: params.empresa_id ?? null,
            _projeto_id: params.projeto_id ?? null,
        });
        if (error)
            return { periodo: p, erro: error.message, registros: [] };
        const rows = Array.isArray(data) ? data.slice(0, 100) : data;
        return { periodo: p, relatorio: params.relatorio, registros: rows };
    },
};
// --------------- Tool 10: explicar métrica ---------------
const METRICAS = {
    absenteismo: "Absenteísmo: percentual de dias de ausência sobre dias úteis esperados no período.",
    falta: "Falta: ausência sem justificativa formal registrada no CRM.",
    atestado: "Atestado: ausência acompanhada de documento médico válido.",
    licenca: "Licença: afastamento previsto em lei (maternidade, casamento, luto, INSS etc.).",
    protocolo: "Protocolo: identificador único no formato CODIGO-AAAAMMDD-SEQUENCIAL, gerado no backend e imutável.",
    wa_entrega: "Taxa de entrega WhatsApp: mensagens com status ENTREGUE sobre total enviadas no período.",
    alerta_critico: "Alerta crítico: alerta gerado pelas regras operacionais com severidade CRITICA.",
};
const explicarInput = z.object({ metrica: z.string().min(1).max(80) });
const explicarMetrica = {
    name: "explicar_metrica",
    description: "Retorna a definição oficial de uma métrica do CRM MK9 (absenteismo, falta, atestado, licenca, protocolo, wa_entrega, alerta_critico). Não consulta dados.",
    inputSchema: explicarInput,
    jsonSchema: zToJson(explicarInput),
    allowedRoles: "*",
    maxRows: 1,
    timeoutMs: 1000,
    sensitivity: "public",
    execute: async (_ctx, params) => {
        const key = params.metrica.toLowerCase().replace(/[^a-z_]/g, "");
        const def = METRICAS[key] ?? METRICAS[key.replace(/s$/, "")];
        return { metrica: params.metrica, definicao: def ?? "Métrica não catalogada. Consulte a Documentação do CRM." };
    },
};
// --------------- Catálogo ---------------
export const TOOL_CATALOG = [
    obterResumoOperacional,
    consultarAusencias,
    consultarAlertas,
    consultarWhatsapp,
    consultarProjetos,
    consultarColaboradores,
    compararPeriodos,
    consultarProtocolos,
    obterRelatorioExistente,
    explicarMetrica,
];
export function toolsForRoles(roles) {
    return TOOL_CATALOG.filter((t) => {
        if (t.allowedRoles === "*")
            return true;
        return t.allowedRoles.some((r) => roles.includes(r));
    });
}
export function findTool(name) {
    return TOOL_CATALOG.find((t) => t.name === name);
}
