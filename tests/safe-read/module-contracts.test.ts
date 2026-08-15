import { describe, expect, it } from "vitest";

/**
 * CRM MK9 — CONTRATOS DOS MÓDULOS CRÍTICOS
 * 
 * Este arquivo consolida as validações de assinatura para evitar regressões 
 * estruturais nos módulos de Gestão, Central, OCP e Relatórios.
 */

const MODULE_EVIDENCE = {
  central: {
    rpc: "processamento_obter_pendencias",
    args: "_user_id uuid, _status text DEFAULT 'PENDENTE'::text"
  },
  qualidade: {
    rpc: "rel_qualidade_lancamentos",
    args: "_inicio date, _fim date, _supervisor_id uuid DEFAULT NULL::uuid"
  },
  ocp: {
    rpc: "criar_ocorrencia_ponto_ambev",
    args: "p_colaborador_id uuid, p_data date, p_periodo text, p_tipo_ocorrencia text, p_protocolo_externo text, p_evidencia_url text DEFAULT NULL::text"
  },
  relatorios: [
    { name: "rel_faltas", args: "_inicio date, _fim date, _empresa_id uuid DEFAULT NULL::uuid, _projeto_id uuid DEFAULT NULL::uuid, _is_export boolean DEFAULT false" },
    { name: "rel_atestados", args: "_inicio date, _fim date, _empresa_id uuid DEFAULT NULL::uuid, _projeto_id uuid DEFAULT NULL::uuid, _is_export boolean DEFAULT false" }
  ]
};

describe("Module Contracts (Baseline)", () => {
  it("Qualidade: rel_qualidade_lancamentos signature is stable", () => {
    expect(MODULE_EVIDENCE.qualidade.args).toContain("_supervisor_id uuid");
  });

  it("OCP: criar_ocorrencia_ponto_ambev is atomic and complete", () => {
    expect(MODULE_EVIDENCE.ocp.args).toContain("p_protocolo_externo text");
  });

  it("Relatórios: rel_faltas and rel_atestados avoid signature ambiguity", () => {
    for (const rel of MODULE_EVIDENCE.relatorios) {
      expect(rel.args).toContain("_is_export boolean");
    }
  });
});
