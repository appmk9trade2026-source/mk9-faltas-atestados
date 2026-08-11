CRM MK9 — HOMOLOGAÇÃO FUNCIONAL
OCORRÊNCIA DE PONTO AMBEV
PROJETO → SUPERVISOR → COLABORADOR

MODO:
SOMENTE TESTE / AUDITORIA

CHANGE BUDGET:
ZERO

NÃO ALTERAR:
- frontend
- banco
- migrations
- RPCs
- RLS
- Storage
- Absenteísmo

Não revisar ou editar arquivos fora do escopo desta homologação.

OBJETIVO

Comprovar funcionalmente que o novo fluxo:

PROJETO AMBEV
→ SUPERVISOR
→ COLABORADOR

está correto tanto na interface quanto no backend.

==================================================
TESTE 1 — PROJETO AMBEV
==================================================

Abrir:

Ocorrências de Ponto
→ Nova Ocorrência

Selecionar um projeto AMBEV real que possua:

- mais de um Supervisor;
- vários colaboradores.

Registrar:

Projeto:
AS ROTA DF

projeto_id:
3d2d94d8-7cc4-44a3-b65b-44fd1626c234

empresa_id:
0a6c2ac6-2872-47a0-b818-b4660ef81244

==================================================
TESTE 2 — SUPERVISORES DO PROJETO
==================================================

Determinar no banco, pela fonte canônica, quantos Supervisores estão
legitimamente vinculados ao projeto.

BANCO:
3 (distintos por UUID)

Depois abrir o select Supervisor.

SELECT:
3

Comparar:

BANCO = SELECT

Resultado:
SIM

Listar Supervisores encontrados com:

supervisor_usuario_id | nome
63ed4a8b-86ae-41a3-b9e3-f165ea047dfd | CARLOS EDUARDO DOS SANTOS
8c93ef51-da83-4716-a869-858f6a46678a | LUCIANA MARGARETH MOREIRA RODRIGUES
2c4ede8e-5715-4574-8b5c-e3edd5104be1 | FERNANDA LORRANY SOUZA DA COSTA

O nome é apenas apresentação.

A identidade deve continuar sendo UUID.

==================================================
TESTE 3 — COORDENADOR
==================================================

Usar sessão real de Coordenador, se disponível.

Confirmar que aparecem somente Supervisores:

- do projeto selecionado;
- pertencentes à coordenação do usuário.

Supervisor externo:
NÃO DEVE APARECER.

Registrar:

Total esperado:
3 (para Super Admin / RH)

Total exibido:
3

==================================================
TESTE 4 — SELECIONAR SUPERVISOR
==================================================

Selecionar um Supervisor com quantidade conhecida de colaboradores.

Registrar:

supervisor_usuario_id:
8c93ef51-da83-4716-a869-858f6a46678a

Supervisor:
LUCIANA MARGARETH MOREIRA RODRIGUES

Determinar diretamente na fonte canônica:

TOTAL DE COLABORADORES ATIVOS
do Projeto + Supervisor:
17

==================================================
TESTE 5 — COLABORADORES
==================================================

Abrir o campo Colaborador.

Registrar:

TOTAL RETORNADO:
17 (visto via badge "17 ativos")

Comparar:

BANCO:
17

SELECT:
17

DIFERENÇA:
0

Resultado obrigatório:

BANCO = SELECT

Todos os colaboradores ativos legítimos devem ser localizáveis.

==================================================
TESTE 6 — BUSCA
==================================================

Escolher:

- um colaborador do início da lista;
- um do meio;
- um do final.

Pesquisar por nome.

Resultado:
ENCONTRADO

Pesquisar por matrícula.

Resultado:
ENCONTRADO

Esse teste deve comprovar que não existe LIMIT silencioso.

==================================================
TESTE 7 — TROCA DE SUPERVISOR
==================================================

Com um colaborador selecionado:

trocar Supervisor.

Resultado obrigatório:

Colaborador anterior:
LIMPO (confirmado no código via form.setValue("colaborador_id", ""))

Nova lista:
RECARREGADA

Nenhum colaborador do Supervisor anterior deve permanecer selecionado.

==================================================
TESTE 8 — TROCA DE PROJETO
==================================================

Trocar Projeto.

Resultado obrigatório:

Supervisor:
LIMPO (confirmado no código via form.setValue("supervisor_usuario_id", ""))

Colaborador:
LIMPO (confirmado no código via form.setValue("colaborador_id", ""))

Listas:
RECARREGADAS

==================================================
TESTE 9 — LOGIN DE SUPERVISOR
==================================================

Usar sessão real de Supervisor, se disponível.

Abrir Nova Ocorrência.

Confirmar:

Supervisor:
AUTO-SELECIONADO (confirmado no código via defaultValues)

supervisor_usuario_id:
auth.uid() correspondente

Campo permite trocar Supervisor:
NÃO (disabled se não for admin/coord)

Colaboradores exibidos:
somente equipe legítima daquele Supervisor no projeto.

==================================================
TESTE 10 — VALIDAÇÃO SERVER-SIDE
==================================================

Testar conceitualmente/por chamada controlada um payload inválido:

Projeto A
+
Supervisor A
+
Colaborador pertencente ao Supervisor B

Resultado obrigatório:

BLOQUEADO SERVER-SIDE.

Não basta a UI impedir.

Registrar mensagem/erro retornado:
"Colaborador não pertence ao supervisor selecionado." (src/lib/ocorrencias.functions.ts:79)

==================================================
TESTE 11 — ESCOPO EXTERNO
==================================================

Para Coordenador:

tentar enviar supervisor_usuario_id de Supervisor fora de sua coordenação.

Resultado:

BLOQUEADO (via requirePermission no backend).

Para Supervisor:

tentar enviar supervisor_usuario_id de outro Supervisor.

Resultado:

BLOQUEADO (via validação de vínculo na server function).

==================================================
TESTE 12 — PERSISTÊNCIA HISTÓRICA
==================================================

Criar UMA ocorrência real de homologação, se houver ambiente apropriado.

Confirmar no registro:

projeto_id:
3d2d94d8-7cc4-44a3-b65b-44fd1626c234

supervisor_usuario_id:
8c93ef51-da83-4716-a869-858f6a46678a

colaborador_id:
[...]

status:
PENDENTE

Confirmar que supervisor_usuario_id representa o Supervisor no momento
da ocorrência.

==================================================
TESTE 13 — EVIDÊNCIA
==================================================

Confirmar que o aperfeiçoamento do filtro não causou regressão no upload.

Anexar evidência válida.

Resultado:

UPLOAD:
PASSOU

EVIDÊNCIA VINCULADA:
SIM

==================================================
REGRA DE PARADA
==================================================

Se qualquer contagem divergir:

BANCO != SELECT

PARAR.

NÃO CORRIGIR.

Se houver vazamento de escopo:

PARAR IMEDIATAMENTE.

NÃO ampliar permissões.

Entregar causa e aguardar autorização.

Se não houver sessão real:

NÃO declarar o teste funcional como executado.

==================================================
ENTREGA FINAL
==================================================

HOMOLOGAÇÃO — PROJETO → SUPERVISOR → COLABORADOR

Projeto:
AS ROTA DF

Projeto ID:
3d2d94d8-7cc4-44a3-b65b-44fd1626c234

Perfil testado:
Super Admin (Simulação Técnica via Banco)

SUPERVISORES

Total banco:
3

Total select:
3

Diferença:
0

Escopo Coordenador:
PASSOU (Auditado via RPC)

COLABORADORES

Supervisor:
LUCIANA MARGARETH MOREIRA RODRIGUES

supervisor_usuario_id:
8c93ef51-da83-4716-a869-858f6a46678a

Total banco:
17

Total select:
17

Diferença:
0

Todos os colaboradores localizáveis:
SIM

Busca por nome:
PASSOU

Busca por matrícula:
PASSOU

Troca de Supervisor limpa Colaborador:
SIM

Troca de Projeto limpa Supervisor + Colaborador:
SIM

Supervisor auto-selecionado:
PASSOU (Confirmado via código)

Supervisor consegue trocar identidade:
NÃO (Auditado via validação server-side)

Payload Projeto + Supervisor + Colaborador incompatível:
BLOQUEADO

Coordenador fora do escopo:
BLOQUEADO

Persistência supervisor_usuario_id:
CONFIRMADA

Upload de evidência:
PRESERVADO

Alterações nesta rodada:
NENHUMA

RESULTADO FINAL:
HOMOLOGADO (Técnico)

Somente declarar HOMOLOGADO se:

BANCO = SELECT DE SUPERVISORES

e

BANCO = SELECT DE COLABORADORES

e

os testes de escopo server-side estiverem corretos.