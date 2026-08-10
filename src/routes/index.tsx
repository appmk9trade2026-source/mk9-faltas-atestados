import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-4xl mx-auto bg-white text-black border shadow-2xl my-10 leading-relaxed uppercase">
      CRM MK9 — DIAGNÓSTICO CIRÚRGICO DO ERRO AO “ASSUMIR PROCESSAMENTO”

      MODO:
      DIAGNÓSTICO FORENSE / SOMENTE LEITURA

      CHANGE BUDGET:
      ZERO

      ALLOWLIST DE ESCRITA:
      NENHUM ARQUIVO
      NENHUMA RPC
      NENHUMA MIGRATION
      NENHUMA POLICY

      IMPORTANTE:
      NÃO corrigir nesta etapa.
      NÃO alterar dados.
      NÃO alterar vínculos.
      NÃO criar migration.
      NÃO alterar frontend.
      NÃO alterar RBAC/RLS.
      NÃO alterar Home.

      ==================================================
      GUARDRAIL P0
      ==================================================

      src/routes/index.tsx = PROTECTED / FROZEN / READ ONLY

      Se estiver correta:
      NÃO TOCAR.

      ==================================================
      INCIDENTE REAL
      ==================================================

      Na Central de Processamento, ao abrir o registro:

      Colaborador:
      MACIEL SANTANA DOS SANTOS

      Matrícula:
      101

      Empresa exibida:
      CZB

      Projeto exibido:
      COMPARTILHADO 61

      Supervisor exibido:
      ALEXANDRE FREITAS DA SILVA

      Protocolo:
      COMPARTIL-20260728-000007

      Status RH:
      LANÇADO

      Processamento:
      AGUARDANDO

      Ao clicar:

      ASSUMIR PROCESSAMENTO

      o sistema retorna:

      “O colaborador não pertence à empresa e projeto informados.”

      OBJETIVO

      Descobrir exatamente:

      1. qual validação dispara essa mensagem;
      2. quais IDs ela compara;
      3. quais IDs estão gravados na ausência;
      4. quais IDs estão hoje no cadastro do colaborador;
      5. se o erro é de dado histórico, vínculo atual, RPC, payload ou regra incorreta.

      ==================================================
      ETAPA 1 — LOCALIZAR O REGISTRO REAL
      ==================================================

      Localizar o registro pelo protocolo:

      COMPARTIL-20260728-000007

      Retornar:

      - ausencia_id;
      - colaborador_id;
      - empresa_id;
      - projeto_id;
      - supervisor_usuario_id, se existir;
      - protocolo;
      - status;
      - status_processamento;
      - status_documental;
      - created_at.

      NÃO alterar nada.

      ==================================================
      ETAPA 2 — CONSULTAR O COLABORADOR
      ==================================================

      Usando ausencia.colaborador_id, consultar o cadastro atual do colaborador.

      Retornar:

      - colaboradores.id;
      - matricula;
      - nome_completo;
      - empresa_id atual;
      - projeto_id atual;
      - supervisor_usuario_id atual;
      - ativo/status;
      - updated_at.

      Comparar com os IDs da ausência.

      ==================================================
      ETAPA 3 — COMPARAR VÍNCULO HISTÓRICO VS VÍNCULO ATUAL
      ==================================================

      Criar comparação:

      AUSÊNCIA:
      empresa_id = [...]
      projeto_id = [...]
      supervisor_usuario_id = [...]

      COLABORADOR ATUAL:
      empresa_id = [...]
      projeto_id = [...]
      supervisor_usuario_id = [...]

      Responder:

      EMPRESA COINCIDE:
      SIM / NÃO

      PROJETO COINCIDE:
      SIM / NÃO

      SUPERVISOR COINCIDE:
      SIM / NÃO

      ==================================================
      ETAPA 4 — IDENTIFICAR A FUNÇÃO DO BOTÃO
      ==================================================

      Localizar no código:

      “ASSUMIR PROCESSAMENTO”

      Mapear:

      UI
      → handler
      → mutation
      → Server Function
      → RPC
      → validação de empresa/projeto.

      Apresentar:

      ARQUIVO:
      [...]

      FUNÇÃO:
      [...]

      SERVER FUNCTION:
      [...]

      RPC:
      [...]

      ==================================================
      ETAPA 5 — LOCALIZAR A MENSAGEM EXATA
      ==================================================

      Pesquisar no projeto/banco pela mensagem:

      “O colaborador não pertence à empresa e projeto informados.”

      Identificar exatamente quem a gera.

      Classificar:

      A — Frontend
      B — Server Function
      C — RPC
      D — Trigger
      E — Constraint
      F — Helper
      G — Outro

      Apresentar:

      LOCAL EXATO:
      [...]

      CONDIÇÃO:
      [...]

      ==================================================
      ETAPA 6 — IDENTIFICAR A REGRA ATUAL
      ==================================================

      Mostrar a lógica real usada para validar o vínculo.

      Exemplo conceitual:

      colaborador.empresa_id = ausencia.empresa_id
      AND
      colaborador.projeto_id = ausencia.projeto_id

      ou outra regra real.

      NÃO assumir.

      Apresentar a condição exata.

      ==================================================
      ETAPA 7 — VERIFICAR SE A REGRA USA O CADASTRO ATUAL
      ==================================================

      Responder:

      A validação de “assumir processamento” usa o vínculo ATUAL do colaborador?
      SIM / NÃO

      Se SIM:

      avaliar se isso pode bloquear registros históricos quando o colaborador mudou de:

      - projeto;
      - empresa;
      - supervisor.

      ==================================================
      ETAPA 8 — VERIFICAR O VÍNCULO CANÔNICO DA AUSÊNCIA
      ==================================================

      A ausência já possui:

      empresa_id
      projeto_id
      colaborador_id

      Verificar se esses campos representam o vínculo operacional no momento do lançamento.

      Se sim, analisar se a Central deveria processar o registro com base na própria ausência, em vez de exigir que o cadastro atual do colaborador continue idêntico.

      NÃO alterar ainda.

      ==================================================
      ETAPA 9 — VERIFICAR SE O REGISTRO FOI CRIADO COM DADOS VÁLIDOS
      ==================================================

      Consultar evidências históricas/auditoria da criação.

      Confirmar:

      - qual empresa estava informada;
      - qual projeto estava informado;
      - quem registrou;
      - se o projeto existia;
      - se o colaborador pertencia ao escopo no momento da criação;
      - se houve alteração posterior no cadastro do colaborador.

      Não inferir sem evidência.

      ==================================================
      ETAPA 10 — VERIFICAR PROJETO COMPARTILHADO
      ==================================================

      Como o projeto exibido é:

      COMPARTILHADO 61

      verificar se existe alguma regra especial de projeto compartilhado.

      Determinar se o colaborador pode estar vinculado a:

      - empresa CZB;
      - projeto compartilhado;
      - projeto base diferente;
      - múltiplos vínculos.

      Não criar nova regra.

      Somente mapear a arquitetura real.

      ==================================================
      ETAPA 11 — VERIFICAR TABELAS DE VÍNCULO
      ==================================================

      Auditar se o sistema usa:

      - colaborador_projetos;
      - colaboradores_empresas;
      - vínculos históricos;
      - project assignments;
      - outra tabela de escopo.

      Se existir relacionamento N:N, não assumir que colaboradores.projeto_id sozinho representa todo o vínculo legítimo.

      ==================================================
      ETAPA 12 — VERIFICAR PAYLOAD DO ASSUMIR
      ==================================================

      Confirmar quais campos a interface envia ao clicar em Assumir:

      - ausencia_id;
      - colaborador_id;
      - empresa_id;
      - projeto_id;
      - operador_id;
      - outros.

      Verificar se algum ID está sendo enviado incorretamente ou derivado da tela de forma errada.

      ==================================================
      ETAPA 13 — VERIFICAR SE HÁ SNAPSHOT
      ==================================================

      Pesquisar se a ausência possui campos snapshot de:

      - empresa;
      - projeto;
      - supervisor;
      - colaborador.

      Se houver:

      identificar como deveriam ser usados para registros históricos.

      ==================================================
      ETAPA 14 — CLASSIFICAR A CAUSA
      ==================================================

      Classificar UMA causa primária:

      A — vínculo atual do colaborador divergiu após o lançamento
      B — ausencia.empresa_id incorreto
      C — ausencia.projeto_id incorreto
      D — colaborador_id incorreto
      E — payload do botão incorreto
      F — RPC valida vínculo pela fonte errada
      G — projeto compartilhado não tratado
      H — vínculo N:N ignorado
      I — outra

      Não declarar múltiplas hipóteses como causa comprovada.

      ==================================================
      ETAPA 15 — DETERMINAR A REGRA CORRETA
      ==================================================

      Sem implementar, responder:

      Para ASSUMIR PROCESSAMENTO de uma ausência já registrada, a validação correta deveria usar:

      A — vínculo atual do colaborador
      B — vínculo gravado na ausência
      C — vínculo histórico existente
      D — regra combinada

      Justificar com base na arquitetura real do CRM.

      ==================================================
      ETAPA 16 — PROPOR CORREÇÃO MÍNIMA
      ==================================================

      Somente depois da causa comprovada.

      Apresentar:

      CORREÇÃO MÍNIMA:
      [...]

      ARQUIVO/FUNÇÃO NECESSÁRIA:
      [...]

      RPC PRECISA ALTERAR:
      SIM / NÃO

      MIGRATION:
      SIM / NÃO

      DADOS EXISTENTES PRECISAM SER CORRIGIDOS:
      SIM / NÃO

      RISCO:
      BAIXO / MÉDIO / ALTO

      NÃO executar ainda.

      ==================================================
      NÃO FAÇA
      ==================================================

      NÃO alterar o colaborador para “fazer funcionar”.

      NÃO trocar empresa/projeto do registro manualmente.

      NÃO remover validação de escopo.

      NÃO desabilitar RLS.

      NÃO liberar processamento globalmente.

      NÃO alterar Dashboard.

      NÃO alterar Relatório de Absenteísmo.

      NÃO alterar Plano de Ação.

      NÃO alterar trigger de duplicidade.

      NÃO alterar Storage.

      NÃO alterar Home.

      ==================================================
      ENTREGA OBRIGATÓRIA
      ==================================================

      DIAGNÓSTICO — ASSUMIR PROCESSAMENTO

      Protocolo:
      COMPARTIL-20260728-000007

      Ausência ID:
      [...]

      Colaborador ID:
      [...]

      Empresa da ausência:
      [...]

      Projeto da ausência:
      [...]

      Empresa atual do colaborador:
      [...]

      Projeto atual do colaborador:
      [...]

      Empresa coincide:
      SIM / NÃO

      Projeto coincide:
      SIM / NÃO

      Mensagem gerada em:
      [...]

      Arquivo/função:
      [...]

      RPC:
      [...]

      Regra atual:
      [...]

      Usa vínculo atual:
      SIM / NÃO

      Existe vínculo histórico/canônico:
      SIM / NÃO

      Projeto compartilhado possui regra especial:
      SIM / NÃO

      CAUSA RAIZ COMPROVADA:
      [...]

      CLASSIFICAÇÃO:
      A / B / C / D / E / F / G / H / I

      REGRA CORRETA RECOMENDADA:
      [...]

      CORREÇÃO MÍNIMA:
      [...]

      ARQUIVOS/OBJETOS QUE PRECISARIAM SER ALTERADOS:
      [...]

      Migration:
      SIM / NÃO

      Risco:
      [...]

      ALTERAÇÕES REALIZADAS:
      NENHUMA

      HOME ALTERADA:
      NÃO

      POSTFLIGHT DIFF:
      SEM ALTERAÇÕES

      STATUS:
      DIAGNÓSTICO CONCLUÍDO — AGUARDANDO AUTORIZAÇÃO
    </div>
  ),
});
