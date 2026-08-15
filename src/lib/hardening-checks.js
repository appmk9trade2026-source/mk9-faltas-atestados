// Fase 8 — Testes automáticos e validação de dados (read-only).
// Todos os checks são idempotentes e respeitam RLS do chamador.
import { supabase } from "@/integrations/supabase/client";
async function timed(fn) {
    const start = performance.now();
    try {
        const value = await fn();
        return { value, ms: Math.round(performance.now() - start) };
    }
    catch (error) {
        return { error, ms: Math.round(performance.now() - start) };
    }
}
// ------- Health Check -------
export async function runHealthChecks() {
    const out = [];
    // 1. RPC saude_sistema
    const saude = await timed(() => supabase.rpc("saude_sistema"));
    out.push({
        id: "rpc.saude_sistema",
        categoria: "rpc",
        titulo: "RPC saude_sistema disponível",
        status: saude.error ? "erro" : "ok",
        descricao: saude.error ? "RPC indisponível" : "Retornou métricas do sistema",
        recomendacao: saude.error ? "Verificar migrations e permissões da função." : undefined,
        duracao_ms: saude.ms,
    });
    // 2. RPC calcular_score
    const score = await timed(() => supabase.rpc("calcular_score_colaboradores_lote", { p_limit: 1 }));
    out.push({
        id: "rpc.calcular_score",
        categoria: "rpc",
        titulo: "Motor de score responde",
        status: score.error ? "erro" : "ok",
        descricao: score.error
            ? "Falha ao invocar calcular_score_colaboradores_lote"
            : "Motor de score respondeu",
        recomendacao: score.error ? "Validar configuração de absenteismo_config." : undefined,
        duracao_ms: score.ms,
    });
    // 3. RPC has_role
    const hr = await timed(() => supabase.rpc("has_role", { _user_id: "00000000-0000-0000-0000-000000000000", _role: "super_admin" }));
    out.push({
        id: "rpc.has_role",
        categoria: "rpc",
        titulo: "Guardião de permissões (has_role)",
        status: hr.error ? "erro" : "ok",
        descricao: hr.error ? "has_role indisponível" : "has_role respondeu corretamente",
        duracao_ms: hr.ms,
    });
    // 4. Detector de alertas
    const det = await timed(() => supabase.from("inteligencia_alertas").select("id", { count: "exact", head: true }));
    out.push({
        id: "table.inteligencia_alertas",
        categoria: "health",
        titulo: "Tabela inteligencia_alertas acessível",
        status: det.error ? "erro" : "ok",
        descricao: det.error ? "Erro ao ler alertas" : "Tabela responde a leitura",
        duracao_ms: det.ms,
    });
    // 5. absenteismo_config presente
    const cfg = await timed(() => supabase.from("absenteismo_config").select("id").limit(1).maybeSingle());
    const cfgOk = !cfg.error && cfg.value?.data != null;
    out.push({
        id: "config.absenteismo",
        categoria: "config",
        titulo: "Configuração de score presente",
        status: cfgOk ? "ok" : "atencao",
        descricao: cfgOk ? "absenteismo_config populado" : "Nenhuma configuração ativa encontrada",
        recomendacao: cfgOk ? undefined : "Acessar /inteligencia/configuracao e salvar os pesos.",
        duracao_ms: cfg.ms,
    });
    // 6. profiles / user_roles acessíveis
    const roles = await timed(() => supabase.from("user_roles").select("user_id", { count: "exact", head: true }));
    out.push({
        id: "table.user_roles",
        categoria: "health",
        titulo: "Matriz de papéis (user_roles) acessível",
        status: roles.error ? "erro" : "ok",
        descricao: roles.error ? "Leitura bloqueada" : "Tabela responde",
        duracao_ms: roles.ms,
    });
    // 7. Storage bucket atestados
    const buckets = await timed(() => supabase.storage.listBuckets());
    const hasAtestados = !buckets.error && (buckets.value?.data ?? []).some((b) => b.name === "atestados");
    out.push({
        id: "storage.atestados",
        categoria: "health",
        titulo: "Bucket atestados presente",
        status: hasAtestados ? "ok" : "atencao",
        descricao: hasAtestados ? "Bucket disponível" : "Bucket não listado (pode ser restrição de RLS)",
        duracao_ms: buckets.ms,
    });
    return out;
}
// ------- RLS / RBAC (não destrutivo) -------
export async function runRlsChecks() {
    const out = [];
    // Tentativa de leitura em tabelas críticas — apenas confirma que não estoura
    const targets = [
        { id: "rls.colaboradores", table: "colaboradores", label: "colaboradores" },
        { id: "rls.ausencias", table: "ausencias", label: "ausencias" },
        { id: "rls.alertas", table: "inteligencia_alertas", label: "inteligencia_alertas" },
        { id: "rls.audit", table: "audit_logs", label: "audit_logs" },
        { id: "rls.profiles", table: "profiles", label: "profiles" },
    ];
    for (const t of targets) {
        const r = await timed(() => supabase.from(t.table).select("id", { count: "exact", head: true }));
        out.push({
            id: t.id,
            categoria: "rls",
            titulo: `RLS: leitura em ${t.label}`,
            status: r.error ? "atencao" : "ok",
            descricao: r.error
                ? `Leitura negada (${r.error.message ?? "sem detalhe"})`
                : "Leitura respeita o escopo do usuário atual",
            duracao_ms: r.ms,
        });
    }
    return out;
}
export async function runDataValidation() {
    const issues = [];
    // Colaboradores ativos sem supervisor
    const semSup = await supabase
        .from("colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true)
        .is("supervisor_usuario_id", null);
    issues.push({
        id: "colabs.sem_supervisor",
        titulo: "Colaboradores ativos sem supervisor",
        quantidade: semSup.count ?? 0,
        gravidade: (semSup.count ?? 0) > 0 ? "atencao" : "info",
        descricao: "Sem supervisor vinculado o registro fica invisível para o gestor direto.",
    });
    // Colaboradores ativos sem projeto
    const semProj = await supabase
        .from("colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true)
        .is("projeto_id", null);
    issues.push({
        id: "colabs.sem_projeto",
        titulo: "Colaboradores ativos sem projeto",
        quantidade: semProj.count ?? 0,
        gravidade: (semProj.count ?? 0) > 0 ? "atencao" : "info",
        descricao: "Ausência de projeto invalida rankings por projeto e comparativos.",
    });
    // Colaboradores ativos sem empresa
    const semEmp = await supabase
        .from("colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true)
        .is("empresa_id", null);
    issues.push({
        id: "colabs.sem_empresa",
        titulo: "Colaboradores ativos sem empresa",
        quantidade: semEmp.count ?? 0,
        gravidade: (semEmp.count ?? 0) > 0 ? "erro" : "info",
        descricao: "Registro órfão de empresa — corrigir antes de gerar relatórios executivos.",
    });
    // Ausências sem tipo
    const ausSemTipo = await supabase
        .from("ausencias")
        .select("id", { count: "exact", head: true })
        .is("tipo_ausencia_id", null);
    issues.push({
        id: "ausencias.sem_tipo",
        titulo: "Ausências sem tipo classificado",
        quantidade: ausSemTipo.count ?? 0,
        gravidade: (ausSemTipo.count ?? 0) > 0 ? "atencao" : "info",
        descricao: "Registros sem tipo não entram no motor de score.",
    });
    // Projetos duplicados (RPC de diagnóstico)
    try {
        const dup = await supabase.rpc("diagnose_projetos_duplicados");
        const rows = dup.data ?? [];
        issues.push({
            id: "projetos.duplicados",
            titulo: "Grupos de projetos com nomes equivalentes",
            quantidade: rows.length,
            gravidade: rows.length > 0 ? "atencao" : "info",
            descricao: "Utilize /configuracoes/projetos/consolidar para unificar.",
        });
    }
    catch {
        /* ignore */
    }
    // Empresas ativas sem colaborador
    const empresas = await supabase.from("empresas").select("id").eq("ativo", true);
    if (!empresas.error && empresas.data) {
        const empIds = empresas.data.map((e) => e.id);
        let orfas = 0;
        if (empIds.length) {
            const colabs = await supabase
                .from("colaboradores")
                .select("empresa_id")
                .in("empresa_id", empIds)
                .eq("ativo", true);
            const withColabs = new Set((colabs.data ?? []).map((c) => c.empresa_id));
            orfas = empIds.filter((id) => !withColabs.has(id)).length;
        }
        issues.push({
            id: "empresas.sem_colab",
            titulo: "Empresas ativas sem colaboradores ativos",
            quantidade: orfas,
            gravidade: orfas > 0 ? "info" : "info",
            descricao: "Empresas sem equipe podem indicar cadastro incompleto.",
        });
    }
    return issues;
}
