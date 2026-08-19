import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { resolveTicket } from "@/lib/support.functions";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Loader2, BookOpen } from "lucide-react";
import { getArticles } from "@/lib/knowledge.functions";

const formSchema = z.object({
  category: z.string({
    required_error: "Selecione uma categoria final",
  }),
  summary: z.string().min(10, "O resumo da solução deve ter pelo menos 10 caracteres"),
  internalNotes: z.string().optional(),
  linkArticleId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ResolucaoChamadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
}

export function ResolucaoChamadoDialog({ open, onOpenChange, ticketId }: ResolucaoChamadoDialogProps) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "",
      summary: "",
      internalNotes: "",
      linkArticleId: "",
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ['kb-articles-published'],
    queryFn: () => getArticles({ data: { status: 'PUBLISHED' } }),
    enabled: open
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => 
      resolveTicket({
        data: {
          ticketId,
          ...values,
        }
      }),
    onSuccess: () => {
      toast.success("Chamado resolvido com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao resolver chamado");
    },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Resolver Chamado</DialogTitle>
          <DialogDescription>
            Forneça os detalhes da solução para encerrar este atendimento.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria Final *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Como o problema foi resolvido?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Correção no Banco">Correção no Banco</SelectItem>
                      <SelectItem value="Ajuste de Permissão">Ajuste de Permissão</SelectItem>
                      <SelectItem value="Dúvida Sanada">Dúvida Sanada</SelectItem>
                      <SelectItem value="Bug Corrigido">Bug Corrigido (Deploy)</SelectItem>
                      <SelectItem value="Processamento Manual">Processamento Manual</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resumo da Solução *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descreva o que foi feito..." 
                      className="min-h-[80px] resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações Internas (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Notas apenas para a equipe de suporte..." 
                      className="min-h-[60px] resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="linkArticleId"
              render={({ field }) => (
                <FormItem className="space-y-2 pt-2 border-t border-dashed">
                  <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                    <BookOpen className="w-3 h-3 text-primary" />
                    Vincular Artigo da Base (Opcional)
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecione um artigo existente..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {articles.map((art) => (
                        <SelectItem key={art.id} value={art.id} className="text-xs">
                          {art.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-[9px]">
                    Vincular o artigo ajudará a equipe a encontrar soluções similares no futuro.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Voltar
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  "Concluir Resolução"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
