# Ocorrência Protocolada: OCP-AMBEV-20260811-000003

## Auditoria de Evidência (Parte A)
- **ID da Ocorrência**: `5dfb6a27-24c7-4774-8eb6-17c6d03fe038`
- **Arquivo Persistido (URL)**: `https://wgozydjiuimxxddhodax.supabase.co/storage/v1/object/public/atestados/ocorrencias-ponto/7ad721fa-ae79-4261-9581-d679097e3318/2026-08-11/57b2da3f-8150-494f-a347-99e33d327388.jpeg`
- **Bucket Real**: `atestados` (Privado)
- **Path no Storage**: `ocorrencias-ponto/7ad721fa-ae79-4261-9581-d679097e3318/2026-08-11/57b2da3f-8150-494f-a347-99e33d327388.jpeg`
- **Causa do 404**: O bucket `atestados` é **privado**, mas o sistema está tentando acessar via `/public/` URL. Como o bucket não permite acesso público, o Supabase retorna `404 Bucket not found` ou `NoSuchBucket` para URLs de acesso público em buckets privados.

## Auditoria de Identidade (Parte B)
- **Supervisor UUID**: `f8cc378b-9f2b-4b06-95fc-4fe79cc319c3`
- **Nome Resolvido**: `ADRIANO WAGNER SOUSA BORGES`
- **Causa da Exibição do UUID**: A query em `listarOcorrencias` no arquivo `src/lib/ocorrencias.functions.ts` seleciona apenas o `id` da relação `supervisor`, e o frontend (`src/routes/_authenticated/ocorrencias-ponto.tsx`) renderiza `oc.supervisor_usuario_id` diretamente.

## Plano de Correção Técnica

### 1. Evidência (Acesso Seguro)
- **Alteração**: Mudar de `getPublicUrl` para um mecanismo que utilize a sessão do usuário. Como o bucket é privado e já possui RLS configurado para permitir leitura por perfis autorizados (RH, Supervisor do projeto, Coordenador), utilizaremos o download via SDK do Supabase que anexa o token de autenticação.
- **Implementação**: No frontend, ao clicar em "Visualizar Evidência", faremos o download do arquivo via `supabase.storage.from('atestados').download(path)` e geraremos um Blob URL temporário.

### 2. Supervisor (Resolução de Nome)
- **Alteração**: Atualizar a `listarOcorrencias` para trazer o campo `nome` da tabela `profiles`.
- **Implementação**: 
  - Ajustar a query no backend.
  - Ajustar o mapeamento de tipos se necessário.
  - Alterar a coluna na tabela do frontend para exibir `oc.supervisor?.nome`.

## Guardrails
- **Bucket**: Permanecerá **PRIVADO**.
- **RLS**: Inalterada.
- **Home**: Redirecionamento puro mantido.
