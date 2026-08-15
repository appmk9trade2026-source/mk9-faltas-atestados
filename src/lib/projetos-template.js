// Modelo XLSX para importação de Projetos — CRM MK9.
// Apenas 2 colunas exatas: Projeto, Empresa.
// Código interno (PRJ-000001), Descrição ("NOVO PROJETO"), Status (ATIVO),
// data de cadastro (created_at) e updated_at são gerados automaticamente
// pelo backend e NUNCA informados pelo usuário.
import * as XLSX from "xlsx";
const COLUNAS = [
    "Projeto",
    "Empresa",
];
const EXEMPLOS = [
    ["Administrativo 61", "CZB"],
    ["Almoxarifado Central", "R&G"],
];
const INSTRUCOES = [
    ["Importação de Projetos — CRM MK9"],
    [],
    ["Formatos aceitos: .xlsx e .csv (até 5 MB, máx. 2.000 linhas)."],
    ["Somente a aba 'Projetos' é lida; as demais são ignoradas."],
    [],
    ["Colunas (nesta ordem exata):"],
    ["  1. Projeto     — nome do projeto (até 120 caracteres)"],
    ["  2. Empresa     — razão social exata da empresa já cadastrada"],
    [],
    ["Campos gerados automaticamente pelo sistema (NÃO informe na planilha):"],
    ["  • Código interno   — formato PRJ-000001, único e imutável"],
    ["  • Descrição        — 'NOVO PROJETO' na criação"],
    ["  • Status           — ATIVO na criação"],
    ["  • Data de cadastro — atribuída no momento da criação (now())"],
    [],
    ["COMO O SISTEMA IDENTIFICA UM PROJETO:"],
    ["  Chave lógica = Empresa + Projeto (nome), comparados sem diferenciar"],
    ["  maiúsculas/minúsculas e ignorando espaços extras."],
    [],
    ["  • Empresa + Projeto ainda NÃO existe   → cria projeto, gera código,"],
    ["                                          descrição 'NOVO PROJETO',"],
    ["                                          status ATIVO e data de cadastro."],
    ["  • Empresa + Projeto JÁ existe          → NÃO duplica; preserva código,"],
    ["                                          data e todos os dados atuais."],
    ["  • Mesma Empresa + Projeto repetida     → linha marcada como duplicada."],
    ["  • Empresa não cadastrada               → linha marcada como erro."],
    [],
    ["Ações possíveis no preview:"],
    ["       CRIAR           — exige permissão projeto.criar"],
    ["       JÁ EXISTENTE    — projeto já cadastrado (nada é alterado)"],
    ["       ERRO            — quando a linha viola alguma regra"],
    [],
    ["Empresas NÃO são criadas automaticamente. Projetos NÃO são excluídos."],
    ["Códigos internos e datas de cadastro NUNCA são alterados nem reutilizados."],
    [],
    ["Segurança e auditoria:"],
    ["  • A confirmação é atômica: se qualquer linha falhar, nenhuma é aplicada."],
    ["  • Respeita RLS, RBAC, permissions/role_permissions/user_permissions"],
    ["    e public.has_permission()."],
    ["  • Cada operação gera trilha com correlation_id."],
];
/** Monta e força o download do arquivo `modelo_importacao_projetos.xlsx`. */
export function downloadProjetosTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([COLUNAS, ...EXEMPLOS]);
    ws["!cols"] = COLUNAS.map((c) => ({ wch: Math.max(24, c.length + 8) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projetos");
    const wsI = XLSX.utils.aoa_to_sheet(INSTRUCOES);
    wsI["!cols"] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsI, "Instruções");
    XLSX.writeFile(wb, "modelo_importacao_projetos.xlsx");
}
export const PROJETOS_TEMPLATE_COLUMNS = COLUNAS;
