CRM MK9 — HARDENING DE VÍNCULO DO COLABORADOR
AUTO-CADASTRO EM AUSÊNCIA MANUAL

REGRA CANÔNICA:

Cada colaborador está vinculado a:

- 1 projeto
- 1 supervisor

por vez.

OBJETIVO:

Preservar essa integridade durante registrar_ausencia_com_colaborador_manual.

REGRAS:

1. MATRÍCULA NÃO EXISTE
Criar colaborador com:
- matrícula
- nome
- projeto_id
- supervisor_usuario_id
- status ativo conforme regra existente

2. MATRÍCULA EXISTE E VÍNCULO É IGUAL
Se:
projeto_id existente = projeto_id do lançamento
AND
supervisor_usuario_id existente = supervisor do lançamento

Reutilizar colaborador_id.

Não alterar cadastro mestre desnecessariamente.

3. MATRÍCULA EXISTE EM OUTRO PROJETO
NÃO atualizar projeto_id automaticamente.

Bloquear o lançamento automático do cadastro e retornar mensagem:

“Esta matrícula já está vinculada a outro projeto. Regularize o vínculo antes de continuar.”

4. MATRÍCULA EXISTE COM OUTRO SUPERVISOR
NÃO atualizar supervisor_usuario_id automaticamente.

Retornar:

“Esta matrícula já está vinculada a outro supervisor. Regularize o vínculo antes de continuar.”

5. TRANSFERÊNCIA LEGÍTIMA
Se o sistema já possuir fluxo de transferência:
usar esse fluxo.

Não transformar lançamento de ausência em mecanismo de transferência cadastral.

Registrar auditoria de:
- colaborador
- projeto anterior
- projeto novo
- supervisor anterior
- supervisor novo
- usuário responsável
- data/hora

6. NOME DIVERGENTE
Se matrícula for a mesma e nome estiver diferente:

não criar outro colaborador.

Não atualizar nome automaticamente sem regra canônica.

Registrar divergência ou permitir atualização somente para perfil autorizado.

7. TESTES

CENÁRIO A
Matrícula nova:
CRIA

CENÁRIO B
Matrícula existente + mesmo projeto + mesmo supervisor:
REUTILIZA

CENÁRIO C
Matrícula existente + outro projeto:
BLOQUEIA

CENÁRIO D
Matrícula existente + outro supervisor:
BLOQUEIA

CENÁRIO E
Nome diferente + mesma matrícula:
NÃO DUPLICA

8. NÃO FAÇA

NÃO mover colaborador silenciosamente.

NÃO trocar supervisor por causa de lançamento de ausência.

NÃO criar duplicidade por nome.

NÃO usar ausência manual como fluxo de transferência.

NÃO alterar Home.

ENTREGA:

Regra 1 projeto por colaborador:
PRESERVADA / FALHOU

Regra 1 supervisor por colaborador:
PRESERVADA / FALHOU

Auto-cadastro matrícula nova:
PASSOU / FALHOU

Reutilização matrícula existente:
PASSOU / FALHOU

Troca silenciosa de projeto:
BLOQUEADA / FALHOU

Troca silenciosa de supervisor:
BLOQUEADA / FALHOU

Auditoria:
PASSOU / FALHOU

RESULTADO:
HOMOLOGADO / DIVERGÊNCIAS ENCONTRADAS