import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  BookOpen, 
  Filter, 
  ChevronRight, 
  Plus, 
  Clock, 
  ShieldCheck,
  Zap
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArticles } from "@/lib/knowledge.functions";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute('/_authenticated/suporte/conhecimento')({
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-articles', search, selectedCategory],
    queryFn: () => getArticles({ data: { search, category: selectedCategory || undefined, status: 'PUBLISHED' } }),
  });

  const categories = [
    { name: "Nova Ausência", count: 12 },
    { name: "Retificação", count: 8 },
    { name: "Ocorrência", count: 15 },
    { name: "Processamento", count: 5 },
    { name: "Permissões", count: 3 },
  ];

  return (
    <AppShell title="Base de Conhecimento" breadcrumb={["Suporte", "Conhecimento"]}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Search Section */}
        <section className="bg-slate-900 text-white rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-700"></div>
          <div className="relative z-10 space-y-6 max-w-2xl">
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter">
              Como podemos ajudar hoje?
            </h1>
            <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
              Pesquise na base de conhecimento interna para encontrar soluções técnicas, 
              procedimentos de RH e diagnósticos de Safe Codes.
            </p>
            <div className="relative group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/search:text-primary transition-colors" />
              <Input 
                placeholder="Ex: Erro ao retificar ausência, Safe Code SUP-OCC..." 
                className="pl-12 h-14 bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl focus:ring-primary focus:border-primary text-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Categories Sidebar */}
          <aside className="space-y-6">
            <Card className="border-none shadow-sm bg-slate-50/50 dark:bg-slate-900/50">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Filter className="w-3 h-3 text-primary" />
                  Categorias
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 px-2 space-y-1">
                <Button 
                  variant={selectedCategory === null ? "secondary" : "ghost"}
                  className="w-full justify-between text-xs font-bold"
                  onClick={() => setSelectedCategory(null)}
                >
                  Todos os Artigos
                  <Badge variant="outline" className="text-[9px]">{articles.length}</Badge>
                </Button>
                {categories.map((cat) => (
                  <Button 
                    key={cat.name}
                    variant={selectedCategory === cat.name ? "secondary" : "ghost"}
                    className="w-full justify-between text-xs font-medium"
                    onClick={() => setSelectedCategory(cat.name)}
                  >
                    {cat.name}
                    <Badge variant="outline" className="text-[9px] font-normal opacity-60">{cat.count}</Badge>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card className="border-dashed bg-primary/5 dark:bg-primary/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-tighter">
                  <Zap className="w-3 h-3" />
                  Atalhos de Atendimento
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Artigos publicados com Safe Code são priorizados nos chamados em aberto.
                </p>
                <Button variant="link" className="p-0 text-[10px] font-bold h-auto">
                  Sugerir novo artigo
                </Button>
              </CardContent>
            </Card>
          </aside>

          {/* Articles Main Area */}
          <main className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                {selectedCategory || "Resultados Recentes"}
              </h2>
              <span className="text-[10px] font-medium text-muted-foreground">
                {articles.length} artigos encontrados
              </span>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-xs text-muted-foreground font-medium">Consultando base de conhecimento...</p>
              </div>
            ) : articles.length === 0 ? (
              <Card className="border-dashed py-20 flex flex-col items-center text-center">
                <BookOpen className="w-12 h-12 text-slate-200 mb-4" />
                <CardTitle className="text-lg text-slate-400">Nenhum artigo encontrado</CardTitle>
                <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">
                  Tente ajustar sua busca ou selecione outra categoria.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {articles.map((article) => (
                  <Card 
                    key={article.id} 
                    className="group hover:border-primary/50 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98]"
                    onClick={() => navigate({ to: `/suporte/conhecimento/${article.slug}` })}
                  >
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-tight">
                          {article.category}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors">
                          {article.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {article.summary}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {new Date(article.updated_at).toLocaleDateString('pt-BR')}
                        </div>
                        {article.slug.includes('sup-') && (
                          <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-500">
                            <ShieldCheck className="w-3 h-3" />
                            SAFE CODE
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
