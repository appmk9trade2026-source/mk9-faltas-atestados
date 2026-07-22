/**
 * DEPRECATED — mantido apenas por compatibilidade temporária.
 *
 * O antigo `solicitarPrimeiroAcesso` foi renomeado para
 * `solicitarRecuperacaoSenha` e agora vive em `./recuperacao-senha.functions`.
 *
 * O fluxo real de "Primeiro acesso" com senha temporária NÃO usa mais este
 * módulo: a autenticação é feita client-side em `auth.tsx` e a troca em
 * `primeiro-acesso-troca.functions.ts`.
 */
export { solicitarRecuperacaoSenha as solicitarPrimeiroAcesso } from "./recuperacao-senha.functions";
