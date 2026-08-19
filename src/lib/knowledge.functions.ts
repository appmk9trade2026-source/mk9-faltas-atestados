import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

export type KnowledgeArticle = Database['public']['Tables']['support_knowledge_articles']['Row'];
export type ArticleStatus = Database['public']['Enums']['support_article_status'];
export type ArticleAudience = Database['public']['Enums']['support_article_audience'];

export const getArticles = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    module: z.string().optional(),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const).optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    let query = supabase
      .from('support_knowledge_articles')
      .select('*');

    if (data.search) {
      query = query.or(`title.ilike.%${data.search}%,summary.ilike.%${data.search}%,content->>'solution'.ilike.%${data.search}%`);
    }
    if (data.category) query = query.eq('category', data.category);
    if (data.module) query = query.eq('source_module', data.module);
    if (data.status) query = query.eq('status', data.status);

    const { data: articles, error } = await query.order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return articles as KnowledgeArticle[];
  });

export const getArticleBySlug = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: article, error } = await supabase
      .from('support_knowledge_articles')
      .select('*')
      .eq('slug', data.slug)
      .single();

    if (error) throw new Error(error.message);
    return article as KnowledgeArticle;
  });

export const upsertArticle = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(5),
    slug: z.string(),
    summary: z.string().optional(),
    content: z.record(z.any()),
    category: z.string(),
    source_module: z.string().optional(),
    audience: z.enum(['SUPPORT_ONLY', 'RH', 'SUPER_ADMIN', 'ALL_AUTHORIZED'] as const),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const articleData = {
      ...data,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: article, error } = await supabase
      .from('support_knowledge_articles')
      .upsert(articleData)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return article as KnowledgeArticle;
  });

export const submitArticleFeedback = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    articleId: z.string().uuid(),
    helpful: z.boolean(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabase
      .from('support_knowledge_article_feedback')
      .upsert({
        article_id: data.articleId,
        user_id: user.id,
        helpful: data.helpful,
      });

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getRelatedArticles = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({
    category: z.string().optional(),
    module: z.string().optional(),
    safeCode: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    let query = supabase
      .from('support_knowledge_articles')
      .select('*')
      .eq('status', 'PUBLISHED');

    if (data.safeCode) {
      // Simplificação: buscar no campo slug ou summary por enquanto
      // Em uma Fase real, usaríamos a tabela de links
      query = query.or(`slug.ilike.%${data.safeCode}%,summary.ilike.%${data.safeCode}%`);
    } else {
      if (data.category) query = query.eq('category', data.category);
      if (data.module) query = query.eq('source_module', data.module);
    }

    const { data: articles, error } = await query.limit(5);
    if (error) throw new Error(error.message);
    return articles as KnowledgeArticle[];
  });

export const createArticleFromTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid(),
    title: z.string(),
    summary: z.string(),
    category: z.string(),
    module: z.string().optional(),
    content: z.record(z.any()),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verificar se o usuário tem permissão de Super Admin ou Admin antes de processar
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAdmin = roles?.role === 'super_admin' || roles?.role === 'admin';
    if (!isAdmin) throw new Error("Permission denied: Only admins can create knowledge base articles.");

    // Sanitização de PII (Exemplo básico por enquanto)
    const sanitizedTitle = data.title.replace(/\d{11}/g, '***'); // Remove CPF
    const slug = sanitizedTitle.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();

    const { data: article, error } = await supabase
      .from('support_knowledge_articles')
      .insert({
        title: sanitizedTitle,
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        summary: data.summary,
        content: data.content,
        category: data.category,
        source_module: data.module,
        created_by: user.id,
        status: 'DRAFT',
        audience: 'ALL_AUTHORIZED',
        version: 1
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Criar link com o ticket de origem
    await supabase
      .from('support_knowledge_article_links')
      .insert({
        article_id: article.id,
        related_ticket_id: data.ticketId
      });

    return article as KnowledgeArticle;
  });

