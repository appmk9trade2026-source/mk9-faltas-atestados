// Modelo XLSX para importação de Projetos — CRM MK9.
// 5 colunas exatas: Projeto, Empresa, Descrição, Status, Data cadastro.
// Código NÃO é informado pelo usuário — é gerado automaticamente pelo sistema
// no formato PRJ-000001, único e imutável.

import * as XLSX from "xlsx";

const COLUNAS = [
  "Projeto",
  "Empresa",
  "Descrição",
  "Status",
  "Data cadastro",
] as const;

const EXEMPLOS: string[][] = [
  ["Novo Projeto", "Empresa Exemplo LTDA", "Projeto novo — exemplo de criação", "ATIVO", "2026-01-01"],
  ["Projeto Armazém Atualizado", "Empresa Exemplo LTDA", "Encerramento operacional", "INATIVO", "2025-03-01"],
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
  ["  3. Descrição      — texto até 500 caracteres (opcional)"],
  ["  4. Status         — ATIVO ou INATIVO"],
  ["  5. Data cadastro  — DD/MM/AAAA ou AAAA-MM-DD (usada apenas na criação)"],
  [],
  ["O código interno do projeto (PRJ-000001, PRJ-000002, …) é gerado"],
  ["automaticamente pelo sistema. Não informe o código na planilha."],
  [],
  ["COMO O SISTEMA IDENTIFICA UM PROJETO:"],
  ["  Chave lógica = Empresa + Projeto (nome), comparados sem diferenciar"],
  ["  maiúsculas/minúsculas e ignorando espaços extras."],
  [],
  ["  • Empresa + Projeto ainda NÃO existe   → cria e gera novo código."],
  ["  • Empresa + Projeto JÁ existe          → atualiza Descrição, Status"],
  ["                                          e Data cadastro; preserva o código."],
  ["  • Mesma Empresa + Projeto repetida     → linha marcada como duplicada."],
  ["  • Empresa não cadastrada               → linha marcada como erro."],
  [],
  ["Ações possíveis no preview:"],
  ["       CRIAR           — exige permissão projeto.criar"],
  ["       ATUALIZAR       — quando descrição muda"],
  ["       ATIVAR          — quando status muda de INATIVO para ATIVO"],
  ["       DESATIVAR       — quando status muda de ATIVO para INATIVO"],
  ["       SEM ALTERAÇÃO   — quando todos os valores são iguais aos atuais"],
  ["       ERRO            — quando a linha viola alguma regra"],
  [],
  ["Empresas NÃO são criadas automaticamente. Projetos NÃO são excluídos."],
  ["Códigos internos NUNCA são alterados nem reutilizados."],
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
