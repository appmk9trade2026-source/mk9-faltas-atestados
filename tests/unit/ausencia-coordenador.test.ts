import { describe, expect, it } from "vitest";
import { friendlyRbacError, parseRbacError } from "@/lib/rbac/errors";

/**
 * Fluxo de lançamento pelo Coordenador.
 *
 * A autorização real vive no banco (RLS + `registrar_ausencia_com_colaborador_manual`,
 * que revalida se o supervisor escolhido pertence à coordenação do usuário).
 * Aqui garantimos que as razões de negócio devolvidas pelo servidor chegam
 * legíveis ao operador — sem vazar SQLSTATE, policy ou stack.
 */
describe("coordenador — mensagens de escopo no lançamento de ausências", () => {
  it("mostra a razão quando o supervisor não pertence à coordenação", () => {
    const out = friendlyRbacError(
      new Error("PROJECT_SCOPE_DENIED: O Supervisor selecionado não pertence à sua coordenação."),
    );
    expect(out.description).toContain("não pertence à sua coordenação");
  });

  it("mostra a razão quando o colaborador está fora do supervisor", () => {
    const out = friendlyRbacError(
      new Error("COLLABORATOR_SCOPE_DENIED: Colaborador não encontrado no seu escopo."),
    );
    expect(out.description).toContain("não encontrado no seu escopo");
  });

  it("pede a seleção do supervisor quando ele é obrigatório", () => {
    const out = friendlyRbacError(
      new Error("INVALID_PAYLOAD: Selecione o Supervisor responsável pelo colaborador."),
    );
    expect(out.description).toContain("Selecione o Supervisor");
  });

  it("nunca expõe SQLSTATE nem nome de policy", () => {
    const out = friendlyRbacError(
      new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso"),
    );
    expect(JSON.stringify(out)).not.toMatch(/42501|row-level security|policy "/i);
  });

  it("preserva o correlation id vindo do hint", () => {
    const shape = parseRbacError({
      message: "PROJECT_SCOPE_DENIED: fora do escopo",
      hint: "corr-123",
    });
    expect(shape.correlationId).toBe("corr-123");
  });
});
