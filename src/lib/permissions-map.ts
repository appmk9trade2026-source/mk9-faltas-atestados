// RBAC — mapa de permissões por mutação/entidade.
// Fonte única para amarrar código a permissões. Use PermissionCode.

import type { PermissionCode } from "@/lib/permissions";

export const PERMISSION_MAP = {
  // Ausências
  createAbsence: "ausencia.criar",
  updateAbsence: "ausencia.editar",
  deleteAbsence: "ausencia.excluir",
  viewAbsence: "ausencia.visualizar",
  // Usuários
  createUser: "usuario.criar",
  updateUser: "usuario.editar",
  viewUser: "usuario.visualizar",
  // Empresas / Projetos
  createCompany: "empresa.criar",
  updateCompany: "empresa.editar",
  deleteCompany: "empresa.excluir",
  createProject: "projeto.criar",
  updateProject: "projeto.editar",
  deleteProject: "projeto.excluir",
  // Colaboradores
  createEmployee: "colaborador.criar",
  updateEmployee: "colaborador.editar",
  deleteEmployee: "colaborador.excluir",
  // Relatórios / Config
  exportReport: "relatorio.exportar",
  viewReport: "relatorio.visualizar",
  updateSettings: "configuracao.visualizar",
  // Permissões
  viewPermissions: "permissao.visualizar",
  updatePermissions: "permissao.editar",
} as const satisfies Record<string, PermissionCode>;

export type PermissionKey = keyof typeof PERMISSION_MAP;
