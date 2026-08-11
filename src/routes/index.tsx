/**
 * CRM MK9 — HOMOLOGAÇÃO DA CORREÇÃO DE IDENTIDADE
 * PLANO DE AÇÃO GERENCIAL — RESPONSÁVEL / CRIADOR
 * 
 * MODO:
 * SOMENTE TESTE
 * 
 * CHANGE BUDGET:
 * ZERO
 * 
 * NÃO ALTERAR:
 * - código
 * - banco
 * - migrations
 * - RLS/RBAC
 * - Dashboard
 * - Home
 * - IA
 * - Plano de Ação
 * 
 * OBJETIVO
 * 
 * Validar a correção que removeu o JOIN direto com profiles e passou a resolver
 * os nomes do responsável/criador por consulta separada.
 * 
 * ==================================================
 * CONTEXTO
 * ==================================================
 * 
 * CAUSA RAIZ:
 * 
 * As chaves de responsável/criador armazenam UUIDs de usuários de autenticação.
 * 
 * Elas NÃO apontam diretamente para a PK de profiles usada no JOIN anterior.
 * 
 * Resultado anterior:
 * nome = null / não informado.
 * 
 * Correção atual:
 * resolver nomes em consulta separada a partir dos UUIDs de usuário.
 * 
 * ==================================================
 * TESTE 1 — RESPONSÁVEL
 * ==================================================
 * 
 * Abrir um plano que tenha responsável definido.
 * 
 * Confirmar:
 * 
 * responsavel_usuario_id:
 * [...]
 * 
 * nome exibido:
 * [...]
 * 
 * nome real esperado:
 * [...]
 * 
 * Resultado:
 * PASSOU / FALHOU
 * 
 * ==================================================
 * TESTE 2 — CRIADOR
 * ==================================================
 * 
 * Abrir um plano com criador conhecido.
 * 
 * Confirmar:
 * 
 * criado_por_usuario_id:
 * [...]
 * 
 * nome exibido:
 * [...]
 * 
 * nome real esperado:
 * [...]
 * 
 * Resultado:
 * PASSOU / FALHOU
 * 
 * ==================================================
 * TESTE 3 — MÚLTIPLOS PLANOS
 * ==================================================
 * 
 * Abrir listagem com vários planos.
 * 
 * Confirmar:
 * 
 * - todos os nomes aparecem corretamente;
 * - nenhum plano legítimo mostra “Não informado”;
 * - UUIDs distintos resolvem para nomes distintos.
 * 
 * ==================================================
 * TESTE 4 — PERFORMANCE
 * ==================================================
 * 
 * Auditar como a consulta separada foi implementada.
 * 
 * Preferido:
 * 
 * 1. coletar UUIDs únicos;
 * 2. realizar UMA consulta em lote;
 * 3. montar mapa user_id → nome.
 * 
 * Evitar:
 * 
 * uma query por linha.
 * 
 * Responder:
 * 
 * Estratégia:
 * BATCH / N+1
 * 
 * Quantidade de queries para N planos:
 * [...]
 * 
 * Se N+1:
 * classificar como risco de performance.
 * 
 * Não corrigir nesta rodada.
 * 
 * ==================================================
 * TESTE 5 — SEGURANÇA
 * ==================================================
 * 
 * Confirmar que a consulta de nomes:
 * 
 * - não usa service_role no frontend;
 * - não amplia acesso a perfis;
 * - respeita políticas vigentes;
 * - não expõe email, telefone ou dados desnecessários.
 * 
 * Retornar apenas o nome necessário para exibição.
 * 
 * ==================================================
 * TESTE 6 — FALLBACK
 * ==================================================
 * 
 * Se um UUID não puder ser resolvido:
 * 
 * não quebrar a tela.
 * 
 * Exibir fallback neutro conforme design atual.
 * 
 * Mas não usar “Não informado” quando o usuário realmente existe e é acessível.
 * 
 * ==================================================
 * TESTE 7 — IA
 * ==================================================
 * 
 * Confirmar que essa mudança de resolução de nomes NÃO alterou:
 * 
 * - payload da IA;
 * - escopo;
 * - permissões;
 * - criação do plano.
 * 
 * Resultado:
 * PRESERVADO / FALHOU
 * 
 * ==================================================
 * ENTREGA FINAL
 * ==================================================
 * 
 * HOMOLOGAÇÃO — IDENTIDADE DO PLANO DE AÇÃO
 * 
 * Responsável:
 * PASSOU / FALHOU
 * 
 * Criador:
 * PASSOU / FALHOU
 * 
 * “Não informado” indevido:
 * NÃO / SIM
 * 
 * Estratégia de consulta:
 * BATCH / N+1
 * 
 * Performance:
 * ADEQUADA / RISCO
 * 
 * RBAC:
 * PRESERVADO / FALHOU
 * 
 * Dados pessoais extras expostos:
 * NÃO / SIM
 * 
 * IA:
 * PRESERVADA / FALHOU
 * 
 * Alterações realizadas:
 * NENHUMA
 * 
 * RESULTADO:
 * HOMOLOGADO / DIVERGÊNCIAS ENCONTRADAS
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    });
  },
  loader: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    });
  },
  component: () => null,
});