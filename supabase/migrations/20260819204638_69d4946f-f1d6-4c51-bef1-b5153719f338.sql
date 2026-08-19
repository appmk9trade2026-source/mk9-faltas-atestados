-- 1. Enum Types
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_article_status') THEN
        CREATE TYPE public.support_article_status AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_article_audience') THEN
        CREATE TYPE public.support_article_audience AS ENUM ('SUPPORT_ONLY', 'RH', 'SUPER_ADMIN', 'ALL_AUTHORIZED');
    END IF;
END $$;

-- 2. Knowledge Articles Table
CREATE TABLE IF NOT EXISTS public.support_knowledge_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    summary TEXT,
    content JSONB NOT NULL DEFAULT '{}',
    category TEXT NOT NULL,
    source_module TEXT,
    audience public.support_article_audience NOT NULL DEFAULT 'ALL_AUTHORIZED',
    status public.support_article_status NOT NULL DEFAULT 'DRAFT',
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID REFERENCES auth.users(id) NOT NULL,
    reviewed_by UUID REFERENCES auth.users(id),
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Article Links Table
CREATE TABLE IF NOT EXISTS public.support_knowledge_article_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES public.support_knowledge_articles(id) ON DELETE CASCADE NOT NULL,
    related_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
    related_safe_code TEXT,
    related_protocol TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Article Feedback Table
CREATE TABLE IF NOT EXISTS public.support_knowledge_article_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES public.support_knowledge_articles(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    helpful BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(article_id, user_id)
);

-- 5. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_knowledge_articles TO authenticated;
GRANT ALL ON public.support_knowledge_articles TO service_role;

GRANT SELECT, INSERT, DELETE ON public.support_knowledge_article_links TO authenticated;
GRANT ALL ON public.support_knowledge_article_links TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.support_knowledge_article_feedback TO authenticated;
GRANT ALL ON public.support_knowledge_article_feedback TO service_role;

-- 6. RLS
ALTER TABLE public.support_knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_knowledge_article_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_knowledge_article_feedback ENABLE ROW LEVEL SECURITY;

-- Remove policies if exist to avoid errors on retry
DROP POLICY IF EXISTS "Anyone authenticated can select published articles" ON public.support_knowledge_articles;
DROP POLICY IF EXISTS "Admins and Super Admins can manage articles" ON public.support_knowledge_articles;

-- Policies for Articles
CREATE POLICY "Anyone authenticated can select published articles"
    ON public.support_knowledge_articles FOR SELECT
    TO authenticated
    USING (status = 'PUBLISHED' OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins and Super Admins can manage articles"
    ON public.support_knowledge_articles FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at_kb()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_kb ON public.support_knowledge_articles;
CREATE TRIGGER set_updated_at_kb
BEFORE UPDATE ON public.support_knowledge_articles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_kb();
