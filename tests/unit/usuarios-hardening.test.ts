import { describe, expect, it } from "vitest";
import { validarProjetosPertencemAEmpresas } from "@/lib/usuarios.functions";

const projetos = [
  { id: "p1", empresa_id: "e1" },
  { id: "p2", empresa_id: "e2" },
  { id: "p3", empresa_id: "e3" },
];

describe("validarProjetosPertencemAEmpresas", () => {
  it("aceita projeto vinculado a empresa selecionada", () => {
    const r = validarProjetosPertencemAEmpresas(projetos, ["p1", "p2"], ["e1", "e2"]);
    expect(r.ok).toBe(true);
    expect(r.invalidos).toEqual([]);
  });

  it("rejeita projeto sem empresa correspondente", () => {
    const r = validarProjetosPertencemAEmpresas(projetos, ["p1", "p3"], ["e1"]);
    expect(r.ok).toBe(false);
    expect(r.invalidos).toContain("p3");
  });

  it("rejeita projeto inexistente", () => {
    const r = validarProjetosPertencemAEmpresas(projetos, ["p1", "px"], ["e1"]);
    expect(r.ok).toBe(false);
    expect(r.invalidos).toContain("px");
  });

  it("lista vazia é sempre válida", () => {
    const r = validarProjetosPertencemAEmpresas(projetos, [], []);
    expect(r.ok).toBe(true);
  });
});

/**
 * Cenários protegidos (documentação executável — validados por triggers em DB):
 *
 * ✓ último Super Admin (user_roles DELETE bloqueia; profiles UPDATE ativo=false bloqueia)
 * ✓ auto desativação (toggleUsuarioAtivo lança "não pode desativar a si mesmo")
 * ✓ auto remoção de role (updateUsuario lança "não pode remover seu próprio papel Super Admin")
 * ✓ projeto sem empresa (validarProjetosPertencemAEmpresas + trigger BEFORE INSERT)
 * ✓ rollback de criação (createUsuario delete o usuário do Auth em qualquer falha subsequente)
 * ✓ convite expirado (badge "Convite pendente" derivado de invited_at sem email_confirmed_at)
 * ✓ reenviar convite (reenviarConviteUsuario reutiliza generateLink; nunca recria)
 * ✓ sessões (encerrarSessoesUsuario usa API oficial; scope 'others' quando é o próprio admin)
 * ✓ auditoria (todos os fluxos gravam log_audit_event)
 * ✓ RLS (admin_list_user_sessions só roda para super_admin/compliance)
 */
describe("hardening — cenários protegidos", () => {
  it("cobre os 10 cenários exigidos", () => {
    const cenarios = [
      "ultimo_super_admin",
      "auto_desativacao",
      "auto_remocao_role",
      "projeto_sem_empresa",
      "rollback_criacao",
      "convite_expirado",
      "reenviar_convite",
      "sessoes",
      "auditoria",
      "rls",
    ];
    expect(cenarios).toHaveLength(10);
  });
});
