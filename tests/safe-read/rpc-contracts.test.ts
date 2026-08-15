import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";

/**
 * ETAPA 5 — TESTE DE CONTRATO DAS FUNÇÕES DE BANCO (RPC)
 * 
 * Este teste garante que as assinaturas das RPCs críticas não sofram regressões 
 * ou overloads ambíguos que quebrem o frontend ou o PostgREST.
 */

describe("RPC Contract Integrity", () => {
  it("detectar_conflitos_ausencia must have exactly 9 parameters", async () => {
    const { data, error } = await supabase.rpc("read_query", {
      query: `
        SELECT pg_get_function_arguments(p.oid) as arguments
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'detectar_conflitos_ausencia'
      `
    });

    if (error) throw error;
    
    // Expecting exactly one version to avoid PostgREST 300 Multiple Choices
    expect(data).toHaveLength(1);
    const args = data[0].arguments;
    
    // Canonical 9-parameter signature:
    // _colaborador_id, _data_inicio, _data_fim, _tipo, _origem_registro, 
    // _manual_matricula, _empresa_id, _projeto_id, _supervisor_id
    const paramCount = args.split(",").length;
    expect(paramCount).toBe(9);
    expect(args).toContain("_colaborador_id uuid");
    expect(args).toContain("_supervisor_id uuid");
  });

  it("dashboard_metrics must return jsonb", async () => {
    const { data, error } = await supabase.rpc("read_query", {
      query: `
        SELECT pg_get_function_result(p.oid) as result_type
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'dashboard_metrics'
      `
    });

    if (error) throw error;
    expect(data[0].result_type).toBe("jsonb");
  });

  it("rel_atestados and rel_faltas must have non-ambiguous signatures", async () => {
     const { data, error } = await supabase.rpc("read_query", {
      query: `
        SELECT proname, count(*) as versions
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname IN ('rel_atestados', 'rel_faltas')
        GROUP BY proname
      `
    });

    if (error) throw error;
    
    // Overloads are discouraged for public RPCs called via PostgREST
    // as it causes HTTP 300 errors if the caller doesn't specify all parameters.
    for (const row of data) {
      expect(row.versions, `Function ${row.proname} has multiple overloads`).toBe(1);
    }
  });
});
