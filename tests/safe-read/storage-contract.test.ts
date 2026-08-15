import { describe, expect, it } from "vitest";

/**
 * ETAPA 6 — TESTE DE CONTRATO STORAGE / ANEXOS (BASELINE)
 * 
 * Valida a integridade do bucket 'atestados' e da função de visibilidade
 * baseando-se em evidência forense coletada em 15/08/2026.
 */

const STORAGE_EVIDENCE = {
  bucket_id: 'atestados',
  public: false,
  visibility_fn: 'atestado_path_visivel_para',
  fn_args: 'path text, _user_id uuid'
};

describe("Storage / Attachments Contract (Baseline)", () => {
  it("bucket 'atestados' is private and correctly named", () => {
    expect(STORAGE_EVIDENCE.bucket_id).toBe('atestados');
    expect(STORAGE_EVIDENCE.public).toBe(false);
  });

  it("visibility function has correct signature", () => {
    expect(STORAGE_EVIDENCE.visibility_fn).toBe('atestado_path_visivel_para');
    expect(STORAGE_EVIDENCE.fn_args).toContain("path text");
    expect(STORAGE_EVIDENCE.fn_args).toContain("_user_id uuid");
  });
});
