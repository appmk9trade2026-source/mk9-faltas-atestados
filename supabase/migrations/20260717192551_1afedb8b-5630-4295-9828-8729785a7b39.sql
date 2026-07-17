
-- Enums
CREATE TYPE public.homolog_status AS ENUM ('PENDENTE','EM_EXECUCAO','APROVADO','REPROVADO','NAO_APLICAVEL');
CREATE TYPE public.homolog_criticidade AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
CREATE TYPE public.homolog_classificacao AS ENUM ('BUG','MELHORIA','DUVIDA','CONFIGURACAO');
CREATE TYPE public.op_assist_prioridade AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
CREATE TYPE public.op_assist_status AS ENUM ('ABERTO','EM_ANDAMENTO','RESOLVIDO','CANCELADO');

-- Homologações (cenários)
CREATE TABLE public.homologacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  responsavel text,
  status public.homolog_status NOT NULL DEFAULT 'PENDENTE',
  criticidade public.homolog_criticidade NOT NULL DEFAULT 'MEDIA',
  classificacao public.homolog_classificacao,
  evidencia text,
  evidencia_url text,
  resultado text,
  observacoes text,
  executado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executado_em timestamptz,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homologacoes TO authenticated;
GRANT ALL ON public.homologacoes TO service_role;
ALTER TABLE public.homologacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homolog select" ON public.homologacoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'rh'));
CREATE POLICY "homolog insert" ON public.homologacoes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "homolog update" ON public.homologacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "homolog delete" ON public.homologacoes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_homolog_updated BEFORE UPDATE ON public.homologacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_homolog_audit AFTER INSERT OR UPDATE ON public.homologacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('homologacao','homologacoes');

CREATE INDEX idx_homolog_modulo ON public.homologacoes(modulo);
CREATE INDEX idx_homolog_status ON public.homologacoes(status);

-- Go-Live checklist
CREATE TABLE public.go_live_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  item text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  concluido boolean NOT NULL DEFAULT false,
  concluido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.go_live_checklist TO authenticated;
GRANT ALL ON public.go_live_checklist TO service_role;
ALTER TABLE public.go_live_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golive select" ON public.go_live_checklist FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'rh'));
CREATE POLICY "golive write" ON public.go_live_checklist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE TRIGGER trg_golive_updated BEFORE UPDATE ON public.go_live_checklist
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_golive_audit AFTER INSERT OR UPDATE ON public.go_live_checklist
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('go_live','go_live_checklist');

-- Operação Assistida
CREATE TABLE public.operacao_assistida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia text NOT NULL,
  descricao text,
  prioridade public.op_assist_prioridade NOT NULL DEFAULT 'MEDIA',
  responsavel text,
  situacao public.op_assist_status NOT NULL DEFAULT 'ABERTO',
  resolucao text,
  aberto_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aberto_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operacao_assistida TO authenticated;
GRANT ALL ON public.operacao_assistida TO service_role;
ALTER TABLE public.operacao_assistida ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opassist select" ON public.operacao_assistida FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'rh'));
CREATE POLICY "opassist write" ON public.operacao_assistida FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE TRIGGER trg_opassist_updated BEFORE UPDATE ON public.operacao_assistida
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_opassist_audit AFTER INSERT OR UPDATE ON public.operacao_assistida
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('operacao_assistida','operacao_assistida');

-- KPIs RPC
CREATE OR REPLACE FUNCTION public.homolog_kpis()
RETURNS jsonb LANGUAGE sql STABLE SET search_path='public' AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.homologacoes),
    'executados', (SELECT count(*) FROM public.homologacoes WHERE status IN ('APROVADO','REPROVADO','NAO_APLICAVEL')),
    'aprovados', (SELECT count(*) FROM public.homologacoes WHERE status='APROVADO'),
    'reprovados', (SELECT count(*) FROM public.homologacoes WHERE status='REPROVADO'),
    'pendentes', (SELECT count(*) FROM public.homologacoes WHERE status IN ('PENDENTE','EM_EXECUCAO')),
    'nao_aplicavel', (SELECT count(*) FROM public.homologacoes WHERE status='NAO_APLICAVEL'),
    'criticos_reprovados', (SELECT count(*) FROM public.homologacoes WHERE status='REPROVADO' AND criticidade IN ('ALTA','CRITICA')),
    'por_modulo', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.modulo), '[]'::jsonb) FROM (
      SELECT modulo,
             count(*) AS total,
             count(*) FILTER (WHERE status='APROVADO') AS aprovados,
             count(*) FILTER (WHERE status='REPROVADO') AS reprovados,
             count(*) FILTER (WHERE status IN ('PENDENTE','EM_EXECUCAO')) AS pendentes
      FROM public.homologacoes GROUP BY modulo
    ) x)
  );
$$;

-- Seed cenários
INSERT INTO public.homologacoes (modulo, nome, descricao, criticidade) VALUES
('Autenticação','Login válido','Login com credenciais corretas leva ao dashboard.','CRITICA'),
('Autenticação','Senha inválida','Login com senha errada retorna erro amigável.','ALTA'),
('Autenticação','Logout','Logout encerra sessão e redireciona para /auth.','ALTA'),
('Autenticação','Expiração da sessão','Sessão expirada redireciona ao login sem exceção.','MEDIA'),
('Autenticação','Usuário sem permissão','Usuário sem role adequada é bloqueado.','CRITICA'),
('Empresas','Cadastro de empresa','Criar nova empresa com validação de nome único.','ALTA'),
('Empresas','Edição de empresa','Editar dados existentes e persistir.','MEDIA'),
('Empresas','Inativação','Soft-delete via ativo=false não remove histórico.','ALTA'),
('Projetos','Cadastro de projeto','Vinculado a empresa ativa; nome único por empresa.','ALTA'),
('Projetos','Ativar com empresa inativa','Bloqueia ativação quando empresa está inativa.','ALTA'),
('Colaboradores','Cadastro completo','Matrícula única por empresa; normalização de contato.','ALTA'),
('Colaboradores','Vínculo inválido','Projeto de outra empresa é rejeitado.','ALTA'),
('Colaboradores','Ativação com projeto inativo','Bloqueada corretamente.','MEDIA'),
('Importação','XLSX válido','Importar planilha modelo com sucesso.','ALTA'),
('Importação','CSV válido','Importar CSV modelo com sucesso.','ALTA'),
('Importação','Arquivo inválido','Rejeitar formato/tamanho fora do padrão.','MEDIA'),
('Importação','Matrícula duplicada','Tratamento correto (ignorar ou atualizar).','ALTA'),
('Importação','Projeto inexistente','Registrar erro na linha e continuar.','MEDIA'),
('Importação','Empresa inexistente','Registrar erro na linha e continuar.','MEDIA'),
('Ausências','Cadastro','Criar ausência com tipo oficial e período válidos.','CRITICA'),
('Ausências','Edição','Editar somente registros PENDENTE.','ALTA'),
('Ausências','Documento','Upload de anexo até 10MB no bucket privado.','ALTA'),
('Ausências','Tipo oficial','Snapshot imutável de tipo/período no registro.','ALTA'),
('Ausências','Quantidade','Cálculo automático de dias e data de retorno.','MEDIA'),
('Ausências','Comunicação','Gerar comunicação a partir da ausência.','ALTA'),
('Ausências','Auditoria','Alterações registram evento em audit_logs.','ALTA'),
('Comunicações','Template','Templates pré-definidos carregam corretamente.','MEDIA'),
('Comunicações','Envio','Status ENVIADO bloqueia edição e exclusão.','ALTA'),
('Painel RH','KPIs','Cards refletem filtros e refresh 60s.','ALTA'),
('Painel RH','Ação em lote','Marcar como LANÇADO em lote.','ALTA'),
('Painel RH','Exportação','Exportar fila em XLSX/CSV.','MEDIA'),
('Dashboard','KPIs comparativos','Período atual x anterior calculados corretamente.','ALTA'),
('Dashboard','Drill-down','Filtros aplicados propagam nas séries.','MEDIA'),
('Dashboard','Categorias','Distribuição por categoria oficial correta.','MEDIA'),
('Relatórios','Absenteísmo','RPC retorna dados consistentes.','ALTA'),
('Relatórios','Atestados','Filtro por período e projeto.','MEDIA'),
('Relatórios','Auditoria','Sumário por ação/usuário.','MEDIA'),
('Auditoria','Imutabilidade','Update/Delete em audit_logs é bloqueado.','CRITICA'),
('Auditoria','Captura automática','Triggers gravam CREATE/UPDATE/DELETE_LOGICO.','ALTA'),
('Configurações','Tipos de ausência','Editáveis por Super Admin; código imutável.','ALTA'),
('Permissões','Super Admin','Acessa todos os módulos.','CRITICA'),
('Permissões','RH','Acessa operação sem Sistema/Auditoria total.','ALTA'),
('Permissões','Compliance','Consulta e homologação.','ALTA'),
('Permissões','Supervisor','Sem acesso a Sistema, Homologação, Configurações críticas.','ALTA'),
('Permissões','Acesso indevido','Tentativa de rota restrita redireciona.','CRITICA'),
('Exportações','Excel','Arquivo XLSX válido gerado.','ALTA'),
('Exportações','CSV','Arquivo CSV válido gerado.','MEDIA'),
('Exportações','PDF','Relatório PDF com marca e paginação.','ALTA'),
('Exportações','Auditoria','Evento EXPORTACAO gravado.','ALTA');

-- Seed Go-Live checklist
INSERT INTO public.go_live_checklist (categoria, item, ordem) VALUES
('Critérios','Build limpo sem erros de compilação',1),
('Critérios','Nenhum bug crítico em aberto',2),
('Critérios','Nenhum bug de alta severidade em aberto',3),
('Critérios','Todos os módulos aprovados na homologação',4),
('Critérios','Backup validado (export e restore testados)',5),
('Critérios','RLS validada em todos os perfis',6),
('Critérios','Auditoria validada (imutável e completa)',7),
('Critérios','Exportações XLSX/CSV/PDF validadas',8),
('Critérios','Responsáveis aprovaram formalmente',9),
('Plano','Backup pré-implantação executado',10),
('Plano','Deploy da versão aprovada',11),
('Plano','Validação pós-deploy (smoke tests)',12),
('Plano','Monitoramento ativo por 24h',13),
('Plano','Plano de rollback documentado e testado',14),
('Plano','Comunicação de conclusão aos stakeholders',15);
