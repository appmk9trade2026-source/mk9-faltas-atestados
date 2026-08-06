
DROP FUNCTION IF EXISTS public.admin_integridade_resumo();
DROP FUNCTION IF EXISTS public.admin_integridade_listar(text, text, uuid, uuid, text, int, int);

-- 1. Atualizar o resumo
create or replace function public.admin_integridade_resumo()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _resumo json;
begin
  select json_build_object(
    'gerado_em', now(),
    'supervisor_sem_coordenador', (select count(*) from public.profiles p join public.user_roles ur on p.id = ur.user_id where ur.role = 'supervisor' and not exists (select 1 from public.coordenador_supervisores cs where cs.supervisor_id = p.id)),
    'colaborador_sem_supervisor', (select count(*) from public.colaboradores where supervisor_usuario_id is null and ativo = true),
    'supervisor_email_sem_uuid', (select count(*) from public.colaboradores where supervisor_usuario_id is null and supervisor_email is not null and ativo = true),
    'supervisor_sem_matricula', (select count(*) from public.profiles p join public.user_roles ur on p.id = ur.user_id where ur.role = 'supervisor' and (p.matricula is null or p.matricula = '')),
    'usuario_sem_empresa', (select count(*) from public.profiles p where not exists (select 1 from public.user_empresas ue where ue.user_id = p.id)),
    'usuario_sem_projeto', (select count(*) from public.profiles p where not exists (select 1 from public.user_projetos up where up.user_id = p.id)),
    'matricula_duplicada', (select count(*) from (select matricula from public.profiles where matricula is not null and matricula <> '' group by matricula having count(*) > 1) t),
    'vinculo_orfao', (select count(*) from public.colaboradores c where not exists (select 1 from public.empresas e where e.id = c.empresa_id) or not exists (select 1 from public.projetos p where p.id = c.projeto_id)),
    'ausencias_sem_autoria', (select count(*) from public.ausencias where criado_por_usuario_id is null)
  ) into _resumo;
  
  return _resumo;
end;
$$;

-- 2. Atualizar a listagem
create or replace function public.admin_integridade_listar(
  _tipo text default null,
  _criticidade text default null,
  _empresa_id uuid default null,
  _projeto_id uuid default null,
  _busca text default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  registro_id uuid,
  tipo text,
  criticidade text,
  entidade text,
  nome text,
  email text,
  matricula text,
  empresa_id uuid,
  empresa_nome text,
  projeto_id uuid,
  projeto_nome text,
  descricao text,
  causa text,
  acao_recomendada text,
  detectado_em timestamptz,
  total_geral bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with base as (
    select 
      p.id as registro_id, 'supervisor_sem_coordenador'::text as tipo, 'alta'::text as criticidade, 'usuario'::text as entidade,
      p.nome, p.email, p.matricula, null::uuid as empresa_id, null::text as empresa_nome, null::uuid as projeto_id, null::text as projeto_nome,
      'Supervisor sem coordenador responsável'::text as descricao, 'Vínculo hierárquico ausente'::text as causa, 'Vincular a um coordenador'::text as acao_recomendada, p.created_at as detectado_em
    from public.profiles p join public.user_roles ur on p.id = ur.user_id where ur.role = 'supervisor' and not exists (select 1 from public.coordenador_supervisores cs where cs.supervisor_id = p.id)
    
    union all
    
    select 
      c.id as registro_id, 'colaborador_sem_supervisor'::text as tipo, 'media'::text as criticidade, 'colaborador'::text as entidade,
      c.nome_completo as nome, c.email, c.matricula, c.empresa_id, e.nome as empresa_nome, c.projeto_id, pj.nome as projeto_nome,
      'Colaborador sem supervisor vinculado'::text as descricao, 'Vínculo técnico ausente'::text as causa, 'Editar colaborador e definir supervisor'::text as acao_recomendada, c.created_at as detectado_em
    from public.colaboradores c left join public.empresas e on e.id = c.empresa_id left join public.projetos pj on pj.id = c.projeto_id where c.supervisor_usuario_id is null and c.ativo = true
    
    union all
    
    select 
      p.id as registro_id, 'supervisor_email_sem_uuid'::text as tipo, 'critica'::text as criticidade, 'colaborador'::text as entidade,
      p.nome_completo as nome, p.email, p.matricula, p.empresa_id, e.nome as empresa_nome, p.projeto_id, pj.nome as projeto_nome,
      'E-mail de supervisor não resolvido para UUID'::text as descricao, 'Importação legada ou e-mail não encontrado na base de usuários'::text as causa, 'Resolver pendências de supervisor'::text as acao_recomendada, p.created_at as detectado_em
    from public.colaboradores p left join public.empresas e on e.id = p.empresa_id left join public.projetos pj on pj.id = p.projeto_id where p.supervisor_usuario_id is null and p.supervisor_email is not null and p.ativo = true
    
    union all
    
    select 
      p.id as registro_id, 'supervisor_sem_matricula'::text as tipo, 'media'::text as criticidade, 'usuario'::text as entidade,
      p.nome, p.email, p.matricula, null::uuid as empresa_id, null::text as empresa_nome, null::uuid as projeto_id, null::text as projeto_nome,
      'Supervisor sem matrícula cadastrada no perfil'::text as descricao, 'Cadastro incompleto'::text as causa, 'Editar perfil e informar matrícula'::text as acao_recomendada, p.created_at as detectado_em
    from public.profiles p join public.user_roles ur on p.id = ur.user_id where ur.role = 'supervisor' and (p.matricula is null or p.matricula = '')
    
    union all
    
    select 
      p.id as registro_id, 'usuario_sem_empresa'::text as tipo, 'baixa'::text as criticidade, 'usuario'::text as entidade,
      p.nome, p.email, p.matricula, null::uuid as empresa_id, null::text as empresa_nome, null::uuid as projeto_id, null::text as projeto_nome,
      'Usuário sem empresa vinculada'::text as descricao, 'Falta de vínculo de escopo'::text as causa, 'Editar permissões e vincular empresa'::text as acao_recomendada, p.created_at as detectado_em
    from public.profiles p where not exists (select 1 from public.user_empresas ue where ue.user_id = p.id)
    
    union all
    
    select 
      p.id as registro_id, 'usuario_sem_projeto'::text as tipo, 'baixa'::text as criticidade, 'usuario'::text as entidade,
      p.nome, p.email, p.matricula, null::uuid as empresa_id, null::text as empresa_nome, null::uuid as projeto_id, null::text as projeto_nome,
      'Usuário sem projeto vinculado'::text as descricao, 'Falta de vínculo de escopo'::text as causa, 'Editar permissões e vincular projeto'::text as acao_recomendada, p.created_at as detectado_em
    from public.profiles p where not exists (select 1 from public.user_projetos up where up.user_id = p.id)
    
    union all
    
    select 
      p.id as registro_id, 'matricula_duplicada'::text as tipo, 'alta'::text as criticidade, 'usuario'::text as entidade,
      p.nome, p.email, p.matricula, null::uuid as empresa_id, null::text as empresa_nome, null::uuid as projeto_id, null::text as projeto_nome,
      'Matrícula duplicada entre usuários'::text as descricao, 'Erro de cadastro ou reaproveitamento de matrícula'::text as causa, 'Verificar duplicidade e corrigir'::text as acao_recomendada, p.created_at as detectado_em
    from public.profiles p where p.matricula in (select matricula from public.profiles where matricula is not null and matricula <> '' group by matricula having count(*) > 1)
    
    union all
    
    select 
      c.id as registro_id, 'vinculo_orfao'::text as tipo, 'critica'::text as criticidade, 'colaborador'::text as entidade,
      c.nome_completo as nome, c.email, c.matricula, c.empresa_id, e.nome as empresa_nome, c.projeto_id, pj.nome as projeto_nome,
      'Vínculo órfão (empresa ou projeto inexistente)'::text as descricao, 'Exclusão de registros pai ou erro de migração'::text as causa, 'Verificar vínculos de empresa/projeto'::text as acao_recomendada, c.created_at as detectado_em
    from public.colaboradores c left join public.empresas e on e.id = c.empresa_id left join public.projetos pj on pj.id = c.projeto_id where (c.empresa_id is not null and not exists (select 1 from public.empresas e2 where e2.id = c.empresa_id)) or (c.projeto_id is not null and not exists (select 1 from public.projetos p2 where p2.id = c.projeto_id))

    union all
    
    select 
      a.id as registro_id, 'ausencias_sem_autoria'::text as tipo, 'media'::text as criticidade, 'colaborador'::text as entidade,
      a.autor_nome_snapshot as nome, null::text as email, a.protocolo as matricula, a.empresa_id, e.nome as empresa_nome, a.projeto_id, pj.nome as projeto_nome,
      'Ausência sem identificação de autoria (ID de usuário)'::text as descricao, 'Registro legado ou criado via rotina automática sem sessão'::text as causa, 'Auditar registro e contestar se necessário'::text as acao_recomendada, a.criado_em as detectado_em
    from public.ausencias a left join public.empresas e on e.id = a.empresa_id left join public.projetos pj on pj.id = a.projeto_id where a.criado_por_usuario_id is null
  ),
  filtrado as (
    select * from base
    where (_tipo is null or base.tipo = _tipo)
      and (_criticidade is null or base.criticidade = _criticidade)
      and (_empresa_id is null or base.empresa_id = _empresa_id)
      and (_projeto_id is null or base.projeto_id = _projeto_id)
      and (_busca is null or (
          base.nome ilike '%' || _busca || '%' or 
          base.email ilike '%' || _busca || '%' or 
          base.matricula ilike '%' || _busca || '%' or
          base.empresa_nome ilike '%' || _busca || '%' or
          base.projeto_nome ilike '%' || _busca || '%'
      ))
  ),
  total as (select count(*) as t from filtrado)
  select f.*, t.t from filtrado f, total t
  order by f.detectado_em desc
  limit _limit offset _offset;
end;
$$;
