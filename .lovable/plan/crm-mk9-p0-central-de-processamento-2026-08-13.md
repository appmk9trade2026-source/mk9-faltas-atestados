# CRM MK9 — P0 CENTRAL DE PROCESSAMENTO
## Diagnóstico Forense e Correção de Integridade do Drawer

O teste funcional demonstrou que a Central de Processamento apresenta dois problemas críticos (P0):
1. **Divergência Numérica:** O contador do card não coincide com a lista exibida no Drawer.
2. **Dados Estruturados Ausentes:** O "Tipo da Ausência" (FALTA, ATESTADO, etc.) não é exibido de forma estruturada, apenas o texto livre de observações.

Este plano visa a rastreabilidade ponta a ponta para garantir que `Card Count = Group Count = Drawer Count` e que a taxonomia canônica seja respeitada.

---

### Plano de Ação

#### Etapa 1: Padronização do Agrupamento (Integridade P0)
- **Normalização de Chaves:** Padronizar a chave de agrupamento `${item.colaborador_id || 'm-' + item.colaborador_matricula}|${item.projeto_id || 'sem-projeto'}` em todas as camadas de código.
- **Correção da Busca no Clique:** Ajustar o handler do botão "Ver lançamentos" para localizar o grupo completo no memo `agrupado` usando a mesma chave normalizada, evitando falhas de referência ou perda de itens.
- **Ordenação Canônica:** Garantir que a lista no Drawer esteja sempre ordenada por data de registro (mais antigo primeiro), para manter consistência com o cálculo de SLA.

#### Etapa 2: Evolução do Drawer (UX e Visibilidade)
- **Lista Lateral Persistente:** Manter a lista de lançamentos do grupo visível no Drawer, permitindo ao operador navegar entre todas as pendências sem fechar a janela.
- **Contadores Forenses:** Exibir claramente "X pendências deste colaborador" no cabeçalho do Drawer para confirmação imediata.

#### Etapa 3: Exposição de Dados Estruturados (Tipo Canônico)
- **Mapeamento do Banco:** Utilizar o campo `tipo_ausencia_nome` (ex: "FALTA INJUSTIFICADA") como a fonte primária de classificação.
- **Apresentação em Destaque:** Criar uma seção dedicada no `Painel360` para o "TIPO DA AUSÊNCIA" e outra separada para "MOTIVO / OBSERVAÇÕES" (texto livre), impedindo a confusão entre classificação técnica e relato do supervisor.
- **Tags na Lista:** Adicionar o tipo da ausência em cada item da lista lateral do Drawer para triagem rápida.

#### Etapa 4: Fluxo de Transição
- **Remoção Dinâmica:** Ao processar um item, ele deve ser removido da lista do Drawer e o contador do card atualizado automaticamente (X -> X-1).
- **Preservação de Contexto:** Se houver mais itens no grupo, selecionar o próximo automaticamente após a conclusão do anterior.

---

### Critérios de Aceite e Verificação
- O número exibido no card "Ver X lançamentos" deve ser exatamente igual ao número de itens listados no Drawer.
- O campo "Tipo da Ausência" deve exibir a taxonomia oficial (ex: ATESTADO MÉDICO), e não o texto das observações.
- Teste com grupo de 5+ pendências validado com sucesso.
- **Guardrail P0:** `src/routes/index.tsx` permanece como redirecionamento puro.

### Arquivos a serem modificados
- `src/routes/_authenticated/processamento.tsx`: Lógica de agrupamento, clique e renderização do Sheet.
- `src/components/processamento/painel-360.tsx`: Destaque para o tipo canônico e separação da observação.
- `src/components/processamento/types.ts`: Garantir tipagem compatível.
