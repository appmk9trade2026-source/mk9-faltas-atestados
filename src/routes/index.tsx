import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * GUARDRAIL P0: PROTEÇÃO DA HOME
 * 
 * Este arquivo foi restaurado para redirecionamento puro.
 * INCIDENTE P0 — OCORRÊNCIA DE PONTO AMBEV EXISTE, MAS AUSÊNCIA NÃO APARECE
 * + POSSÍVEL DESLOCAMENTO DE DATA 14/08 → 13/08
 * 
 * MODO:
 * AUDITORIA FORENSE PRIMEIRO.
 * NÃO ALTERAR CÓDIGO/SQL ANTES DE COMPROVAR A CAUSA.
 * 
 * CONTEXTO REAL
 * 
 * Em "Ocorrências de Ponto AMBEV" existem lançamentos recentes da colaboradora:
 * 
 * GRACIANE BRITO DOS SANTOS AMORIM
 * Matrícula: 2778
 * Supervisor: ADRIANO WAGNER SOUSA BORGES
 * 
 * Na tela aparecem no topo protocolos como:
 * 
 * OCP-AMBEV-20260814-000003
 * OCP-AMBEV-20260814-000002
 * OCP-AMBEV-20260814-000001
 * 
 * Porém, pelo menos dois lançamentos realizados em 14/08/2026 estão sendo apresentados na coluna Data como 13/08/2026.
 * 
 * Além disso, as faltas lançadas pelo Supervisor NÃO estão aparecendo na tela /ausencias quando consultadas pelo SUPER ADMIN.
 * 
 * Isso é P0 porque pode significar:
 * 
 * - ocorrência criada sem ausência correspondente;
 * - falha parcial de transação;
 * - erro de sincronização;
 * - filtro/status incorreto em /ausencias;
 * - RLS inesperada até para Super Admin;
 * - divergência empresa/projeto;
 * - erro de timezone;
 * - confusão entre data da ausência e data de criação.
 * 
 * NÃO presumir a causa.
 * 
 * ==================================================
 * ETAPA 1 — LOCALIZAR OS PROTOCOLOS FÍSICOS
 * ==================================================
 * 
 * Consultar diretamente no banco os protocolos:
 * 
 * OCP-AMBEV-20260814-000003
 * OCP-AMBEV-20260814-000002
 * OCP-AMBEV-20260814-000001
 * 
 * Confirmar os nomes exatos existentes antes da consulta.
 * 
 * Para cada protocolo retornar:
 * 
 * ocorrencia_id:
 * protocolo:
 * colaborador_id:
 * matricula:
 * colaborador_nome:
 * empresa_id:
 * empresa:
 * projeto_id:
 * projeto:
 * supervisor_id:
 * supervisor:
 * tipo_ocorrencia:
 * motivo:
 * data_ocorrencia:
 * created_at:
 * updated_at:
 * status:
 * status_vinculo:
 * ausencia_id:
 * protocolo_ausencia:
 * created_by:
 * 
 * Usar somente campos que realmente existam.
 * 
 * Não inventar colunas.
 * 
 * ==================================================
 * ETAPA 13 — AUDITORIA DOS REGISTROS AFETADOS
 * ==================================================
 * 
 * Depois de identificar a causa, procurar lançamentos recentes com o mesmo padrão.
 * 
 * Período sugerido:
 * 10/08/2026 até 14/08/2026.
 * 
 * Identificar:
 * 
 * ocorrências sem ausencia_id;
 * ocorrências com ausencia_id inexistente;
 * ausências não exibidas;
 * datas deslocadas em -1 dia;
 * falhas parciais de Supervisor.
 * 
 * Somente auditoria inicialmente.
 * 
 * NÃO alterar dados históricos em massa sem apresentar o impacto.
 * 
 * ==================================================
 * ENTREGA FINAL
 * ==================================================
 * 
 * P0 — OCORRÊNCIAS AMBEV / AUSÊNCIAS / DATA
 * 
 * Protocolos auditados:
 * [...]
 * 
 * Criados realmente em 14/08:
 * SIM / NÃO
 * 
 * Data da ausência informada:
 * [...]
 * 
 * Data armazenada:
 * [...]
 * 
 * Data exibida:
 * [...]
 * 
 * Existe deslocamento timezone:
 * SIM / NÃO
 * 
 * Causa da data 13/08:
 * [...]
 * 
 * Ocorrência 000001 possui ausência:
 * SIM / NÃO
 * 
 * Ocorrência 000002 possui ausência:
 * SIM / NÃO
 * 
 * Ocorrência 000003 possui ausência:
 * SIM / NÃO
 * 
 * Ausencia IDs:
 * [...]
 * 
 * Ausências existem fisicamente:
 * SIM / NÃO
 * 
 * Super Admin consegue SELECT:
 * SIM / NÃO
 * 
 * /ausencias exibe:
 * SIM / NÃO
 * 
 * Causa raiz da ausência não aparecer:
 * [...]
 * 
 * Houve sucesso parcial:
 * SIM / NÃO
 * 
 * Correção:
 * [...]
 * 
 * Teste Supervisor:
 * PASSOU / FALHOU
 * 
 * Teste data 14/08:
 * PASSOU / FALHOU
 * 
 * Ocorrência criada:
 * PASSOU / FALHOU
 * 
 * Ausência criada:
 * PASSOU / FALHOU
 * 
 * Visível para Super Admin:
 * PASSOU / FALHOU
 * 
 * RLS:
 * PRESERVADA
 * 
 * Regra de duplicidade:
 * PRESERVADA
 * 
 * WhatsApp:
 * INALTERADO
 * 
 * Home:
 * REDIRECIONAMENTO PURO
 * 
 * RESULTADO:
 * CORRIGIDO E HOMOLOGADO
 * ou
 * CAUSA IDENTIFICADA — NÃO HOMOLOGAR
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});
