# Absence Guardian

CRM DE FALTAS E ATESTADOS — MK9

ETAPA 1 — FUNDAÇÃO, AUTENTICAÇÃO E LAYOUT BASE

Visão do Produto:

Crie a fundação de um sistema web interno da MK9 para registrar faltas e atestados, organizar a operação do RH e controlar quais registros já foram lançados no sistema externo da empresa.

Todo o frontend e backend devem ser construídos dentro do Lovable, utilizando:

- React

- TypeScript

- Tailwind CSS

- shadcn/ui

- Supabase

- Supabase Auth

- Supabase PostgreSQL

- Row Level Security

Implemente:

1. Conexão com o Supabase

- Conecte o projeto ao Supabase.

- Configure autenticação por e-mail e senha.

- Não permita cadastro público.

- Os usuários serão criados posteriormente pelo Super Admin.

- Crie controle de sessão persistente.

- Redirecione usuários não autenticados para a tela de Login.

- Após login bem-sucedido, redirecione para o Dashboard.

2. Tabela de perfis

Crie a tabela profiles vinculada à tabela auth.users.

Campos:

- id: uuid, chave primária e referência para auth.users.id

- nome: text, obrigatório

- email: text, obrigatório

- role: text, obrigatório

- ativo: boolean, padrão true

- created_at: timestamptz, padrão now()

- updated_at: timestamptz, padrão now()

Valores permitidos para role:

- super_admin

- rh

- supervisor

- compliance

Regras:

- Usuários inativos não podem acessar o sistema.

- Cada usuário pode consultar o próprio perfil.

- Super Admin pode consultar e editar todos os perfis.

- As permissões devem ser aplicadas no banco com RLS.

- Não confiar apenas em ocultação de botões no frontend.

3. Tela de Login

Crie uma tela de Login com:

- Campo de e-mail.

- Campo de senha.

- Botão Entrar.

- Mostrar/ocultar senha.

- Estado de carregamento.

- Mensagem clara para credenciais inválidas.

- Mensagem clara para usuário inativo.

- Redirecionamento automático após login.

- Botão sair no ambiente autenticado.

4. Layout autenticado

Crie um layout interno com:

- Sidebar lateral recolhível.

- Cabeçalho superior.

- Área principal de conteúdo.

- Nome do usuário logado.

- Papel do usuário.

- Avatar com iniciais.

- Botão sair.

Menu lateral:

- Dashboard

- Nova Ausência

- Painel do RH

- Histórico

- Colaboradores

- Alertas

- Relatórios

- Configurações

- Usuários

Permissões visuais do menu:

- Usuários: somente super_admin.

- Configurações: super_admin e rh.

- Painel do RH: super_admin e rh.

- Compliance: mostrar apenas Dashboard, Alertas e Relatórios.

- Supervisor: mostrar Dashboard, Nova Ausência e Histórico.

- RH: mostrar todos os itens, exceto Usuários.

- Super Admin: mostrar todos os itens.

5. Páginas temporárias

Crie páginas temporárias simples para cada item do menu, apenas com:

- Título da página.

- Texto “Módulo em construção”.

- Breadcrumb.

- Estrutura visual consistente.

Não implemente ainda:

- Cadastro de empresas.

- Cadastro de projetos.

- Cadastro de colaboradores.

- Formulário de ausência.

- Painel do RH funcional.

- Dashboard com métricas.

- Upload de anexos.

- IA de compliance.

- Relatórios reais.

- Gestão de usuários completa.

UI/Design:

- A interface deve ser bonita, harmônica, intuitiva e moderna.

- Usar as melhores práticas de design e UX reconhecidas nos últimos anos.

- Inspiração visual em dashboards modernos como Linear, Notion, Stripe Dashboard e Supabase.

- Usar boa hierarquia visual.

- Usar espaçamentos consistentes.

- Usar ícones Lucide.

- Usar cores sóbrias e profissionais.

- Desktop como experiência principal.

- Responsivo para notebooks, tablets e celulares.

- Criar estados de loading, erro e vazio.

- Garantir acessibilidade e bom contraste.

Guardrails:

- NÃO permita cadastro público.

- NÃO exponha chaves privadas no frontend.

- NÃO use dados mockados depois que o Supabase estiver conectado.

- NÃO altere a estrutura do Supabase Auth.

- NÃO implemente funcionalidades das próximas etapas.

- NÃO deixe páginas internas acessíveis sem autenticação.

- NÃO use apenas o frontend para validar permissões.

Validação obrigatória:

- Teste login válido.

- Teste login inválido.

- Teste acesso a rota interna sem autenticação.

- Teste logout.

- Teste visibilidade do menu para cada perfil.

- Confirme que a tabela profiles possui RLS ativa.

- Confirme que usuário inativo não consegue utilizar o sistema.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mk9-faltas-atestados.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1ef2b47d-72cc-4bd1-92a9-40dffd5d86ef).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
