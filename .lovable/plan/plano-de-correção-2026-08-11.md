---
title: Correção Ocorrências AMBEV - Evidência e Nome Supervisor
description: Implementação de acesso seguro a evidências em bucket privado e resolução de nomes de supervisores na listagem.
---

# Plano de Correção

## 1. Resolução de Nomes de Supervisores
Ajustar a função de listagem para incluir o nome do supervisor e atualizar o componente de listagem.

- **Arquivo**: `src/lib/ocorrencias.functions.ts`
  - Alterar query de `supervisor:supervisor_usuario_id (id)` para `supervisor:supervisor_usuario_id (nome)`.
- **Arquivo**: `src/routes/_authenticated/ocorrencias-ponto.tsx`
  - Alterar a renderização da coluna Supervisor de `{oc.supervisor_usuario_id}` para `{oc.supervisor?.nome || oc.supervisor_usuario_id}`.

## 2. Acesso Seguro a Evidências
Substituir o acesso via URL pública (que falha em buckets privados) por um mecanismo autenticado.

- **Arquivo**: `src/routes/_authenticated/ocorrencias-ponto.tsx`
  - Criar função `handleViewEvidence` que extrai o path da URL armazenada.
  - Usar `supabase.storage.from(BUCKET_ATESTADOS).createSignedUrl(path, 60)` para gerar um link temporário seguro.
  - Abrir o link gerado em nova aba.
  - *Nota*: A URL persistida no banco contém o domínio do Supabase. Precisamos extrair a parte após `/atestados/` para obter o path correto.

## 3. Prevenção na Criação
Ajustar o upload para não depender de `publicUrl`.

- **Arquivo**: `src/routes/_authenticated/ocorrencias-ponto.tsx`
  - No `onSubmit`, persistir o `filePath` completo ou a URL mas garantir que a leitura use o path. O padrão atual de persistir a URL completa será mantido para compatibilidade, mas o leitor será inteligente.

## Segurança e Guardrails
- Mantém o bucket `atestados` como **privado**.
- Mantém RLS restritiva.
- Mantém `src/routes/index.tsx` como redirecionamento puro.
- Não altera lógica de modo manual ou AMBEV Fase 4.
