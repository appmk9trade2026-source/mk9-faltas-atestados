// Modelo XLSX para importação de Projetos — CRM MK9.
// Reutilizável fora do wizard (botão "Baixar modelo" na tela principal).

import * as XLSX from "xlsx";

const COLUNAS = [
  "cnpj_empresa",
  "codigo_projeto",
  "nome_projeto",
  "status",
  "descricao",
  "data_inicio",
  "data_fim",
  "observacoes",
] as const;

const EXEMPLOS: string[][] = [
  // Criação
  [
    "12.345.678/0001-90",
    "NOVO01",
    "Novo Projeto",
    "ATIVO",
    "Projeto novo — exemplo de criação",
    "2026-01-01",
    "",
    "",
  ],
  // Atualização (mantém CNPJ + código, altera nome e desativa)
  [
    "12.345.678/0001-90",
    "ARMT",
    "Projeto Armazém Atualizado",
    "INATIVO",
    "Encerramento operacional em 2026-06",
    "2025-03-01",
    "2026-06-30",
    "Encerrar atendimento após inventário.",
  ],
];

const INSTRUCOES: string[][] = [
  ["Importação e Atualização de Projetos — CRM MK9"],
  [],
  ["Formatos aceitos: .xlsx e .csv (até 5 MB, máx. 2.000 linhas)."],
  ["Somente a aba 'Projetos' é lida; as demais são ignoradas."],
  [],
  ["Colunas obrigatórias:"],
  ["  • cnpj_empresa — CNPJ da empresa já cadastrada (com ou sem máscara)"],
  ["  • codigo_projeto — 2 a 10 caracteres (A-Z, 0-9), sem espaços ou acentos"],
  ["  • nome_projeto — texto até 120 caracteres"],
  ["  • status — ATIVO ou INATIVO"],
  [],
  ["Colunas opcionais:"],
  ["  • descricao — texto até 500 caracteres"],
  ["  • data_inicio — YYYY-MM-DD (ou DD/MM/YYYY)"],
  ["  • data_fim — YYYY-MM-DD (ou DD/MM/YYYY)"],
  ["  • observacoes — texto livre (até 2.000 caracteres)"],
  [],
  ["COMO CRIAR UM PROJETO NOVO:"],
  ["  1. Informe um CNPJ de empresa já cadastrada no sistema."],
  ["  2. Informe um codigo_projeto que ainda NÃO exista para essa empresa."],
  ["  3. Preencha nome_projeto e status."],
  ["  4. Ação calculada: CRIAR (exige permissão projeto.criar)."],
  [],
  ["COMO ATUALIZAR UM PROJETO EXISTENTE:"],
  ["  1. Informe o MESMO CNPJ e o MESMO codigo_projeto do projeto atual."],
  ["  2. Altere apenas os campos desejados: nome, descrição, status,"],
  ["     data_inicio, data_fim ou observações."],
  ["  3. Ação calculada:"],
  ["       ATUALIZAR  — quando qualquer campo editável muda"],
  ["       ATIVAR     — quando status muda de INATIVO para ATIVO"],
  ["       DESATIVAR  — quando status muda de ATIVO para INATIVO"],
  ["       SEM ALTERAÇÃO — quando todos os valores forem iguais aos atuais"],
  ["  4. Exige permissão projeto.editar."],
  [],
  ["Empresa e codigo_projeto NUNCA são alterados por esta importação —"],
  ["eles servem apenas para localizar o projeto existente. O código de"],
  ["protocolo histórico é preservado."],
  [],
  ["Projetos NÃO são excluídos por esta importação."],
  ["Para encerrar um projeto, informe status = INATIVO."],
  [],
  ["Empresas NÃO são criadas automaticamente. Se o CNPJ não existir ou"],
  ["estiver fora do seu escopo, a linha vira ERRO e nada é aplicado."],
  [],
  ["Segurança e auditoria:"],
  ["  • A confirmação é atômica: se qualquer linha falhar, nenhuma é aplicada."],
  ["  • Cada operação gera trilha com correlation_id."],
  ["  • Códigos de projeto com ausências registradas não podem ser trocados."],
  [],
  ["Exemplos preenchidos na aba 'Projetos':"],
  ["  Linha 2 — CRIAÇÃO de projeto novo."],
  ["  Linha 3 — ATUALIZAÇÃO + DESATIVAÇÃO de projeto existente."],
];

/**
 * Monta e força o download do arquivo `modelo_importacao_projetos.xlsx`.
 * Duas abas: `Projetos` (cabeçalho + exemplos) e `Instruções`.
 */
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
