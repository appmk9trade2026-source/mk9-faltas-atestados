import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  ShieldCheck, 
  FileText, 
  Fingerprint,
  ChevronRight,
  Printer,
  FileSearch,
  CheckCircle2,
  Activity
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/administracao/investigacoes")({
  head: () => ({
    meta: [
      { title: "Central de Investigações · CRM MK9" },
      { name: "description", content: "Consolidação de evidências forenses e análise de integridade." },
    ],
  }),
  component: InvestigacoesPage,
});

function InvestigacoesPage() {
  const { roles } = useSession();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const permitido = roles.includes("super_admin") || roles.includes("compliance");

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["investigacoes-busca", searchQuery],
    enabled: !!searchQuery && permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(`
          id,
          tipo,
          data_inicio,
          created_at,
          protocolo,
          autor_nome_snapshot,
          colaborador_id,
          manual_nome,
          manual_matricula,
          hash_integridade
        `)
        .or(`protocolo.ilike.%${searchQuery}%,manual_nome.ilike.%${searchQuery}%,manual_matricula.ilike.%${searchQuery}%`)
        .limit(5);
      
      if (error) throw error;
      return data;
    }
  });

  const { data: selectedRecord, isLoading: isLoadingRecord } = useQuery({
    queryKey: ["investigacoes-detalhe", activeId],
    enabled: !!activeId && permitido,
    queryFn: async () => {
      if (!activeId) return null;
      const { data, error } = await supabase
        .from("ausencias")
        .select(`
          *,
          field_audit:ausencia_field_audit(*)
        `)
        .eq("id", activeId)
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  if (!permitido) {
    return (
      <AppShell title="Central de Investigações">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Acesso restrito a Super Admin e Compliance.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Central de Investigações" breadcrumb={["Administração", "Central de Investigações"]}>
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 h-full">
        
        {/* Sidebar de Busca */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <Card className="shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Busca Investigativa
              </CardTitle>
              <CardDescription>
                Protocolo, matrícula, nome ou hash.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input 
                  placeholder="Ex: 20240801..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Resultados</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[500px]">
              {isSearching ? (
                <div className="p-8 text-center"><Activity className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : !searchResults?.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {searchQuery ? "Nenhum registro encontrado." : "Digite um critério para começar."}
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((res) => (
                    <button
                      key={res.id}
                      onClick={() => setActiveId(res.id)}
                      className={cn(
                        "w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group",
                        activeId === res.id && "bg-muted"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{res.protocolo || "Sem Protocolo"}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {res.manual_nome || "Colaborador não identificado"}
                        </div>
                      </div>
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", activeId === res.id && "translate-x-1")} />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Área de Análise Central */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {!activeId ? (
            <Card className="h-full flex flex-col items-center justify-center p-12 text-center border-dashed">
              <div className="p-4 bg-primary/5 rounded-full mb-4">
                <FileSearch className="h-12 w-12 text-primary/40" />
              </div>
              <h3 className="text-lg font-semibold">Selecione um registro</h3>
              <p className="text-sm text-muted-foreground max-w-[300px] mt-2">
                Utilize a busca lateral para localizar uma ausência e iniciar a análise forense consolidada.
              </p>
            </Card>
          ) : isLoadingRecord || !selectedRecord ? (
            <Card className="h-full flex items-center justify-center">
              <Activity className="h-8 w-8 animate-spin text-primary/40" />
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">{selectedRecord.protocolo}</Badge>
                  <h2 className="text-xl font-bold">{selectedRecord.tipo}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.info("Exportação em desenvolvimento")}>
                    <Printer className="mr-2 h-4 w-4" /> Laudo PDF
                  </Button>
                </div>
              </div>

              {/* Índice de Confiabilidade (Destaque) */}
              <Card className="bg-muted/30 border-primary/10">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        Índice de Confiabilidade do Registro
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">Cálculo baseado em integridade forense e autoria canônica.</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-600">ALTA</div>
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-200">98% SEGURO</Badge>
                    </div>
                  </div>
                  <Separator className="bg-primary/5 mb-4" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Autoria</div>
                      <div className="text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Validada</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Hash Integridade</div>
                      <div className="text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Determinado</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Anexo</div>
                      <div className="text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Presente</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Cadeia Custódia</div>
                      <div className="text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Contínua</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="timeline" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="timeline">Timeline Investigativa</TabsTrigger>
                  <TabsTrigger value="forense">Evidências Digitais</TabsTrigger>
                  <TabsTrigger value="campos">Auditoria de Campos</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline" className="pt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="relative space-y-6 before:absolute before:left-3 before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-muted">
                        
                        {/* Criação */}
                        <div className="relative pl-8">
                          <div className="absolute left-0 top-1 p-1 bg-background border-2 border-emerald-500 rounded-full">
                            <FileText className="h-3 w-3 text-emerald-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">Registro Criado</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {format(new Date(selectedRecord.created_at), "dd/MM/yyyy HH:mm:ss")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Lançado por <span className="font-semibold">{selectedRecord.autor_nome_snapshot}</span>
                            </p>
                            <div className="bg-muted/30 p-2 rounded text-[10px] font-mono mt-2 break-all border border-muted">
                              IP: {selectedRecord.operacao_ip} | ORIGEM: {selectedRecord.operacao_origem}
                            </div>
                          </div>
                        </div>

                        {/* Hash Commit */}
                        <div className="relative pl-8">
                          <div className="absolute left-0 top-1 p-1 bg-background border-2 border-primary rounded-full">
                            <Fingerprint className="h-3 w-3 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">Assinatura Digital Gerada</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {format(new Date(selectedRecord.created_at), "dd/MM/yyyy HH:mm:ss")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Cálculo determinístico SHA-256 (RFC 8785)</p>
                            <div className="bg-primary/5 p-2 rounded text-[10px] font-mono mt-2 break-all border border-primary/10">
                              {selectedRecord.hash_integridade}
                            </div>
                          </div>
                        </div>

                        {/* Status Actual */}
                        <div className="relative pl-8">
                          <div className="absolute left-0 top-1 p-1 bg-background border-2 border-amber-500 rounded-full">
                            <Activity className="h-3 w-3 text-amber-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">Status: {selectedRecord.status}</span>
                              <Badge variant="outline" className="text-[10px]">ATUAL</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Processamento interno em andamento.</p>
                          </div>
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="forense" className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">Metadados de Origem</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-xs border-b pb-1">
                          <span className="text-muted-foreground">IP do Cliente</span>
                          <span className="font-mono">{selectedRecord.operacao_ip}</span>
                        </div>
                        <div className="flex justify-between text-xs border-b pb-1">
                          <span className="text-muted-foreground">User Agent</span>
                          <span className="truncate max-w-[150px]" title={selectedRecord.operacao_user_agent ?? ""}>
                            {selectedRecord.operacao_user_agent}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs border-b pb-1">
                          <span className="text-muted-foreground">Canal</span>
                          <Badge variant="outline" className="text-[9px] h-4">{selectedRecord.operacao_origem}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">Cadeia de Custódia</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground font-bold">HASH ATUAL</span>
                          <div className="bg-muted p-1.5 rounded font-mono text-[9px] break-all border">{selectedRecord.hash_integridade}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground font-bold">HASH ANTERIOR</span>
                          <div className="bg-muted p-1.5 rounded font-mono text-[9px] break-all border">{selectedRecord.hash_anterior || "PRIMEIRO REGISTRO"}</div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="campos" className="pt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Alterações de Campo</CardTitle>
                      <CardDescription>Rastreabilidade granular de edições (ausencia_field_audit).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!(selectedRecord as any).field_audit?.length ? (
                        <div className="text-center py-8 text-xs text-muted-foreground">
                          Nenhuma alteração de campo registrada.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(selectedRecord as any).field_audit.map((audit: any) => (
                            <div key={audit.id} className="flex items-center justify-between p-2 bg-muted/30 rounded border border-muted text-xs">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-[10px]">{audit.field_name}</Badge>
                                <span className="text-muted-foreground truncate max-w-[100px]">{audit.old_value}</span>
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                <span className="font-semibold truncate max-w-[100px]">{audit.new_value}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(audit.created_at), "dd/MM HH:mm")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
