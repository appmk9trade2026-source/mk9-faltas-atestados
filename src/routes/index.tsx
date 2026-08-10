import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre-wrap leading-relaxed">
      CRM MK9 — HOMOLOGAÇÃO FUNCIONAL FINAL DA REATRIBUIÇÃO DE PROCESSAMENTO

      MODO:
      SOMENTE TESTE

      CHANGE BUDGET:
      ZERO

      ALLOWLIST DE ESCRITA:
      NENHUM ARQUIVO
      NENHUMA RPC
      NENHUMA MIGRATION

      IMPORTANTE:

      A correção técnica já foi aplicada.

      NÃO alterar novamente:

      - public.reatribuir_processamento_ausencia
      - reatribuirProcessamentoAdm
      - painel-360.tsx
      - processamento-card.tsx
      - processamento.tsx
      - RLS/RBAC
      - Auditoria
      - Home

      ==================================================
      GUARDRAIL P0
      ==================================================

      src/routes/index.tsx = PROTECTED / FROZEN / READ ONLY

      Se estiver correta:
      NÃO TOCAR.

      ==================================================
      CASO REAL
      ==================================================

      Protocolo:
      COMPARTI-20260727-000008

      Colaborador:
      FRANCISCO BRUNO DOS SANTOS

      Responsável anterior:
      AUTOMAÇÃO MK9

      Status de processamento:
      EM PROCESSAMENTO

      A funcionalidade implementada permite:

      RH
      → ASSUMIR PARA MIM
      → novo responsável = auth.uid()
      → CONCLUIR OPERAÇÃO

      ==================================================
      TESTE 1 — ESTADO INICIAL
      ==================================================

      Abrir o registro pela interface como RH.

      Confirmar:

      Responsável:
      AUTOMAÇÃO MK9

      Botão:
      ASSUMIR PARA MIM

      visível.

      Botão:
      CONCLUIR OPERAÇÃO

      não deve permitir conclusão direta enquanto RH ainda não for o responsável.

      ==================================================
      TESTE 2 — ASSUMIR PARA MIM
      ==================================================

      Clicar:

      ASSUMIR PARA MIM

      Confirmar diálogo.

      Resultado esperado:

      - RPC executada;
      - responsavel_processamento_id passa para auth.uid();
      - nome do responsável atualizado;
      - processamento_iniciado_em preservado;
      - status_processamento continua EM_PROCESSAMENTO;
      - nenhum outro campo operacional alterado.

      ==================================================
      TESTE 3 — UI APÓS REATRIBUIÇÃO
      ==================================================

      Sem reload manual, confirmar:

      Responsável:
      RH atual

      isOwner:
      TRUE

      Botão:
      CONCLUIR OPERAÇÃO

      HABILITADO.

      ==================================================
      TESTE 4 — AUDITORIA
      ==================================================

      Confirmar evento:

      PROCESSAMENTO_REATRIBUIDO

      Com:

      - ausencia_id;
      - protocolo;
      - responsável anterior;
      - responsável novo;
      - usuário executor;
      - timestamp;
      - antes/depois.

      Não apagar ou sobrescrever o evento anterior da Automação MK9.

      ==================================================
      TESTE 5 — CONCLUIR
      ==================================================

      Com o RH agora como responsável:

      executar:

      CONCLUIR OPERAÇÃO.

      Resultado esperado:

      SUCESSO.

      Confirmar:

      status_processamento:
      CONCLUIDO

      processamento_concluido_em:
      PREENCHIDO

      responsável:
      RH atual

      ==================================================
      TESTE 6 — HISTÓRICO FINAL
      ==================================================

      A timeline deve refletir ordem coerente:

      1. Automação MK9 assumiu/processou;
      2. RH reatribuiu;
      3. RH concluiu.

      Não permitir lacuna de autoria.

      ==================================================
      TESTE 7 — CONCORRÊNCIA
      ==================================================

      Se possível, simular:

      Usuário A abre registro atribuído à Automação.

      Usuário B reatribui antes da confirmação de A.

      A tenta assumir.

      Resultado esperado:

      BLOQUEADO POR CONFLITO.

      Não sobrescrever o responsável mais recente.

      ==================================================
      TESTE 8 — RBAC
      ==================================================

      RH:
      PERMITIDO

      Super Admin:
      PERMITIDO

      Compliance:
      PERMITIDO, se papel administrativo vigente

      Supervisor:
      BLOQUEADO

      Coordenador:
      BLOQUEADO

      Usuário não autorizado:
      BLOQUEADO

      ==================================================
      TESTE 9 — REGRESSÃO
      ==================================================

      Confirmar que continuam funcionando:

      - ASSUMIR PROCESSAMENTO em registros AGUARDANDO;
      - conclusão pelo próprio responsável;
      - Automação MK9;
      - Central de Processamento;
      - Dashboard;
      - Auditoria;
      - trigger de vínculo histórico;
      - Relatório de Absenteísmo;
      - Plano de Ação;
      - Login.

      ==================================================
      REGRA DE PARADA
      ==================================================

      Se qualquer etapa falhar:

      PARAR.

      NÃO corrigir.

      Retornar:

      - etapa;
      - mensagem;
      - RPC;
      - SQLSTATE;
      - responsável anterior;
      - responsável atual;
      - causa comprovada ou hipótese.

      Aguardar autorização.

      ==================================================
      ENTREGA FINAL
      ==================================================

      HOMOLOGAÇÃO — REATRIBUIÇÃO DE PROCESSAMENTO

      Protocolo:
      COMPARTI-20260727-000008

      RH autenticado:
      SIM / NÃO

      Responsável inicial:
      AUTOMAÇÃO MK9

      ASSUMIR PARA MIM:
      CONFIRMADO / FALHOU / NÃO EXECUTADO

      Responsável após assumir:
      [...]

      processamento_iniciado_em:
      PRESERVADO / ALTERADO

      Auditoria PROCESSAMENTO_REATRIBUIDO:
      CONFIRMADA / FALHOU

      CONCLUIR OPERAÇÃO:
      CONFIRMADA / FALHOU / NÃO EXECUTADA

      Responsável na conclusão:
      [...]

      Timeline:
      COERENTE / FALHOU

      Concorrência:
      PROTEGIDA / FALHOU / NÃO EXECUTADA

      Supervisor:
      BLOQUEADO / FALHA

      Coordenador:
      BLOQUEADO / FALHA

      RH:
      PERMITIDO / FALHA

      Arquivos alterados nesta homologação:
      NENHUM

      Banco alterado nesta homologação:
      NÃO

      Home:
      INALTERADA

      RESULTADO FINAL:
      HOMOLOGADO / FALHOU / NÃO EXECUTADO

      Somente declarar HOMOLOGADO se o RH realmente assumir e concluir o registro pela interface publicada.
    </div>
  ),
});
