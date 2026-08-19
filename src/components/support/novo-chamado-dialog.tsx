import { useState } from "react";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createTicket, SUPPORT_CATEGORIES, getAvailableCategories, SupportCategory } from "@/lib/support.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { Loader2, Paperclip } from "lucide-react";

const formSchema = z.object({
  category: z.string({
    required_error: "Selecione uma categoria",
  }),
  priority: z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"]),
  subject: z.string().min(5, "O assunto deve ter pelo menos 5 caracteres"),
  description: z.string().min(10, "A descrição deve ter pelo menos 10 caracteres"),
});

type FormValues = z.infer<typeof formSchema>;

interface NovoChamadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: {
    sourceRoute?: string;
    sourceModule?: string;
    entityType?: string;
    entityId?: string;
    protocol?: string;
    safeCode?: string;
    suggestedCategory?: string;
  };
}

export function NovoChamadoDialog({ open, onOpenChange, context }: NovoChamadoDialogProps) {
  const queryClient = useQueryClient();
  const { primaryRole } = useSession();
  
  const categories = getAvailableCategories(primaryRole);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: context?.suggestedCategory || "",
      priority: "NORMAL",
      subject: "",
      description: "",
    },
  });

  // Atualizar categoria se sugerida
  useState(() => {
    if (context?.suggestedCategory) {
      form.setValue("category", context.suggestedCategory);
    }
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => 
      createTicket({
        data: {
          ...values,
          source_route: context?.sourceRoute,
          related_entity_type: context?.entityType,
          related_entity_id: context?.entityId,
          related_protocol: context?.protocol,
          safe_code: context?.safeCode,
        }
      }),

    onSuccess: () => {
      toast.success("Chamado aberto com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      form.reset();
      onOpenChange(false);
    },

    onError: (error: any) => {
      toast.error(error.message || "Erro ao abrir chamado");
    },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Chamado de Suporte</DialogTitle>
          <DialogDescription>
            Preencha as informações abaixo para abrir uma solicitação técnica.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {SUPPORT_CATEGORIES[cat as SupportCategory]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BAIXA">Baixa</SelectItem>
                        <SelectItem value="NORMAL">Normal</SelectItem>
                        <SelectItem value="ALTA">Alta</SelectItem>
                        <SelectItem value="URGENTE">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assunto *</FormLabel>
                  <FormControl>
                    <Input placeholder="Resumo do problema" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descreva detalhadamente o ocorrido..." 
                      className="min-h-[100px] resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(context?.protocol || context?.sourceModule || context?.safeCode) && (
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-dashed text-[10px] space-y-1.5">
                <p className="font-black uppercase text-primary tracking-widest text-[9px]">Contexto Operacional Vinculado</p>
                
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  {context?.sourceModule && (
                    <div>
                      <span className="font-bold">Módulo:</span> {context.sourceModule}
                    </div>
                  )}
                  {context?.protocol && (
                    <div>
                      <span className="font-bold">Relacionado a:</span> {context.protocol}
                    </div>
                  )}
                  {context?.safeCode && (
                    <div className="col-span-2">
                      <span className="font-bold">Código de Diagnóstico:</span> <span className="font-mono text-destructive">{context.safeCode}</span>
                    </div>
                  )}
                </div>
                <p className="text-[8px] italic opacity-70 border-t border-slate-200 dark:border-slate-800 pt-1 mt-1">
                  * Informações técnicas de diagnóstico serão anexadas automaticamente ao chamado para agilizar o atendimento.
                </p>
              </div>
            )}


            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="gap-2">
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Abrir Chamado"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
