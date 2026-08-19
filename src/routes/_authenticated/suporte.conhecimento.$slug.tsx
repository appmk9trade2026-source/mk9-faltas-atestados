import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronLeft, 
  Clock, 
  User, 
  ShieldCheck, 
  ThumbsUp, 
  ThumbsDown,
  Info,
  AlertCircle,
  CheckCircle2,
  HelpCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getArticleBySlug, submitArticleFeedback } from "@/lib/knowledge.functions";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute('/_authenticated/suporte/conhecimento/$slug')({
  component: ArticleDetailPage,
});

function ArticleDetailPage() {
  const { slug } = useParams({ from: '/_authenticated/suporte/conhecimento/$slug' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['kb-article', slug],
    queryFn: () => getArticleBySlug({ data: { slug } }),
  });

  const feedbackMutation = useMutation({
    mutationFn: (helpful: boolean) => submitArticleFeedback({ data: { articleId: article!.id, helpful } }),
    onSuccess: () => {
      setFeedbackSubmitted(true);
      toast.success("Obrigado pelo seu feedback!");
    }
  });

  if (isLoading) {
    return (
      <AppShell title="Carregando Artigo..." breadcrumb={["Suporte", "Conhecimento", "..."]}>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  if (!article) {
    return (
      <AppShell title="Artigo não encontrado" breadcrumb={["Suporte", "Conhecimento", "404"]}>
        <div className="max-w-2xl mx-auto text-center py-20">
          <h2 className="text-2xl font-bold">Artigo não encontrado</h2>
          <Button variant="link" onClick={() => navigate({ to: '/suporte/conhecimento' })}>
            Voltar para a base de conhecimento
          </Button>
        </div>
      </AppShell>
    );
  }

  const content = article.content as any;

  return (
    <AppShell title={article.title} breadcrumb={["Suporte", "Conhecimento", article.title]}>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-2 text-muted-foreground hover:text-primary -ml-2"
          onClick={() => navigate({ to: '/suporte/conhecimento' })}
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar para a Base
        </Button>

        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="text-[10px] font-bold uppercase">
              {article.category}
            </Badge>
            {article.source_module && (
              <Badge variant="outline" className="text-[10px] font-bold uppercase border-primary/20 text-primary">
                Módulo: {article.source_module}
              </Badge>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto font-medium">
              <Clock className="w-3 h-3" />
              Atualizado em {new Date(article.updated_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-tight">
            {article.title}
          </h1>
          <p className="text-lg text-muted-foreground font-medium leading-relaxed border-l-4 border-primary/20 pl-4 italic">
            {article.summary}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <main className="md:col-span-2 space-y-10">
            {/* Sintoma */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Sintoma / Problema
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 leading-relaxed">
                {content.symptom || "Nenhuma informação detalhada sobre o sintoma."}
              </div>
            </section>

            {/* Possível Causa */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                <Info className="w-4 h-4 text-blue-500" />
                Possível Causa
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 leading-relaxed">
                {content.cause || "Causa raiz em análise ou não especificada."}
              </div>
            </section>

            {/* Solução Recomendada */}
            <section className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl p-6 md:p-8 space-y-4 border border-emerald-100 dark:border-emerald-900/20 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Solução Recomendada
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {content.solution || "Procedimento de solução não definido."}
              </div>
            </section>

            {/* Quando Escalar */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                Quando Escalar
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg italic">
                {content.escalation || "Se o problema persistir após os passos acima, abra um chamado técnico Nível 2."}
              </div>
            </section>

            {/* Feedback Footer */}
            <footer className="pt-10 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 rounded-2xl text-center space-y-6">
                <h4 className="text-base font-bold">Este artigo foi útil para você?</h4>
                {!feedbackSubmitted ? (
                  <div className="flex items-center gap-4">
                    <Button 
                      variant="outline" 
                      className="gap-2 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all active:scale-95"
                      onClick={() => feedbackMutation.mutate(true)}
                      disabled={feedbackMutation.isPending}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Sim, ajudou
                    </Button>
                    <Button 
                      variant="outline" 
                      className="gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all active:scale-95"
                      onClick={() => feedbackMutation.mutate(false)}
                      disabled={feedbackMutation.isPending}
                    >
                      <ThumbsDown className="w-4 h-4" />
                      Não muito
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold animate-in fade-in slide-in-from-bottom-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Obrigado por nos ajudar a melhorar!
                  </div>
                )}
              </div>
            </footer>
          </main>

          <aside className="space-y-6">
            <Card className="sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Informações Técnicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {article.slug.includes('sup-') && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-emerald-500 tracking-tighter flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Safe Code Relacionado
                    </label>
                    <div className="font-mono text-xs font-bold p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-md border border-emerald-100 dark:border-emerald-900/30 break-all">
                      {article.slug.toUpperCase()}
                    </div>
                  </div>
                )}
                
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground font-bold">VERSÃO</span>
                    <span className="font-black text-primary">v{article.version}.0</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground font-bold">AUDIÊNCIA</span>
                    <Badge variant="outline" className="text-[8px] h-4 font-bold border-slate-200 uppercase">
                      {article.audience.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Governança</h5>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400">Escritor</span>
                      <span className="text-[10px] font-bold">Atendente MK9</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
