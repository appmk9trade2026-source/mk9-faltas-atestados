/**
 * Normalização canônica de matrícula de colaborador.
 *
 * Regra única, compartilhada com a função Postgres `public.normalize_matricula`:
 *  - trim
 *  - remove TODOS os espaços internos
 *  - MAIÚSCULAS
 *  - preserva zeros à esquerda e demais caracteres válidos
 *
 * Deve ser reutilizada em toda validação (tempo real, cadastro, edição,
 * importação e auditoria) para evitar falsos negativos por diferença de
 * formatação (" ABC001 ", "abc001", "ABC001" → "ABC001").
 */
export function normalizeMatricula(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().replace(/\s+/g, "").toUpperCase();
}
