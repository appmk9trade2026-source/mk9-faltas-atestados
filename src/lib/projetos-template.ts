// Modelo XLSX para importação de Projetos — CRM MK9.
// 6 colunas exatas: Projeto, Empresa, Código, Descrição, Status, Data cadastro.

import * as XLSX from "xlsx";

const COLUNAS = [
  "Projeto",
  "Empresa",
  "Código",
  "Descrição",
  "Status",
  "Data cadastro",
] as const;

const EXEMPLOS: string[][] = [
  ["Novo Projeto", "Empresa Exemplo LTDA", "NOVO01", "Projeto novo — exemplo de criação", "ATIVO", "2026-01-01"],
  ["Projeto Armazém Atualizado", "Empresa Exemplo LTDA", "ARMT", "Encerramento operacional", "INATIVO", "2025-03-01"],
];

const INSTRUCOES: string[][] = [
  ["Importação e Atualização de Projetos — CRM MK9"],
  [],
  ["Formatos aceitos: .xlsx e .csv (até 5 MB, máx. 2.000 linhas)."],
  ["Somente a aba 'Projetos' é lida; as demais são ignoradas."],
  [],
  ["Colunas (nesta ordem exata):"],
  ["  1. Projeto        — nome do projeto (até 120 caracteres)"],
  ["  2. Empresa        — razão social exata da empresa já cadastrada"],
  ["  3. Código         — 2 a 10 caracteres A-Z/0-9 (sem espaços ou acentos)"],
  ["  4. Descrição      — texto até 500 caracteres (opcional)"],
  ["  5. Status         — ATIVO ou INATIVO"],
  ["  6. Data cadastro  — DD/MM/YYYY ou YYYY-MM-DD"],
  [],
  ["COMO CRIAR UM PROJETO NOVO:"],
  ["  1. Informe o nome de uma Empresa já cadastrada (comparação sem diferenciar maiúsculas)."],
  ["  2. Informe um Código que ainda NÃO exista para essa empresa."],
  ["  3. Preencha Projeto e Status."],
  ["  4. Data cadastro é usada como data de criação; se vazia, será a data atual."],
  ["  5. Ação calculada: CRIAR (exige permissão projeto.criar)."],
  [],
  ["COMO ATUALIZAR UM PROJETO EXISTENTE:"],
  ["  1. Informe a MESMA Empresa e o MESMO Código do projeto atual."],
  ["  2. Altere apenas: Projeto (nome), Descrição, Status."],
  ["  3. Data cadastro é ignorada em projetos existentes."],
  ["  4. Ação calculada:"],
  ["       ATUALIZAR       — quando nome ou descrição muda"],
  ["       ATIVAR          — quando status muda de INATIVO para ATIVO"],
  ["       DESATIVAR       — quando status muda de ATIVO para INATIVO"],
  ["       SEM ALTERAÇÃO   — quando todos os valores forem iguais aos atuais"],
  ["  5. Exige permissão projeto.editar."],
  [],
  ["Empresa e Código NUNCA são alterados por esta importação — servem"],
  ["apenas para localizar o projeto existente."],
  [],
  ["Projetos NÃO são excluídos por esta importação."],
  ["Empresas NÃO são criadas automaticamente. Se a empresa não existir,"],
  ["estiver inativa ou for ambígua (nome repetido), a linha vira ERRO."],
  [],
  ["Segurança e auditoria:"],
  ["  • A confirmação é atômica: se qualquer linha falhar, nenhuma é aplicada."],
  ["  • Cada operação gera trilha com correlation_id."],
];

/** Monta e força o download do arquivo `modelo_importacao_projetos.xlsx`. */
export function downloadProjetosTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS as unknown as string[], ...EXEMPLOS]);
  ws["!cols"] = COLUNAS.map((c) => ({ wch: Math.max(18, c.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projetos");

  const wsI = XLSX.utils.aoa_to_sheet(INSTRUCOES);
  wsI["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsI, "Instruções");

  XLSX.writeFile(wb, "modelo_importacao_projetos.xlsx");
}

export const PROJETOS_TEMPLATE_COLUMNS: readonly string[] = COLUNAS;
