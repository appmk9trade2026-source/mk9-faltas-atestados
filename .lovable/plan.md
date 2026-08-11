# Plano de Ação: Correção da Visibilidade de Colaboradores (AMBEV)

O Select de Colaboradores na tela de Ocorrências de Ponto AMBEV está apresentando uma lista incompleta. O diagnóstico indica que a RPC `get_colaboradores_ativos` impõe um filtro restrito de supervisão (`supervisor_usuario_id = auth.uid()`) que impede usuários de RH e Coordenadores de visualizar a equipe completa do projeto, limitando a operacionalidade do sistema.

## Alterações Propostas

### Backend (Banco de Dados)
- Reimplementar a função `public.get_colaboradores_ativos` para incluir uma lógica de bypass baseada em papéis.
- Usuários com papéis `rh`, `coordenador` ou `super_admin` passarão a visualizar todos os colaboradores ativos do projeto selecionado.
- Usuários com papel exclusivo de `supervisor` continuarão visualizando apenas seus liderados diretos, mantendo a governança de dados.

### Frontend
- Nenhuma alteração no componente UI é necessária, pois ele já consome a RPC que será corrigida.

## Detalhes Técnicos
- Migração SQL: `20260811133000_fix_get_colaboradores_ativos_visibility.sql`.
- Lógica interna: Uso de `SECURITY DEFINER` com verificação explícita na tabela `user_roles`.
- Preservação do **Guardrail P0**: O arquivo `src/routes/index.tsx` não será tocado.

## Verificação
1. Execução técnica da migração.
2. Teste funcional via UI simulando usuário Coordenador/RH para validar a listagem completa.
