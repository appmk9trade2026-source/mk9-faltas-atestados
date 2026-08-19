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
import { createTicket } from "@/lib/support.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
    entityType?: string;
    entityId?: string;
    protocol?: string;
    safeCode?: string;
  };
}

export function NovoChamadoDialog({ open, onOpenChange, context }: NovoChamadoDialogProps) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priority: "NORMAL",
      subject: "",
      description: "",
    },
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Problema em Ausência">Problema em Ausência</SelectItem>
                        <SelectItem value="Retificação">Retificação</SelectItem>
                        <SelectItem value="Ocorrência de Ponto">Ocorrência de Ponto</SelectItem>
                        <SelectItem value="Processamento Interno">Processamento Interno</SelectItem>
                        <SelectItem value="Acesso / Permissão">Acesso / Permissão</SelectItem>
                        <SelectItem value="Erro no Sistema">Erro no Sistema</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
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

            {context?.protocol && (
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-dashed text-[10px] space-y-1">
                <p className="font-black uppercase text-primary tracking-widest">Contexto Vinculado</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>Protocolo: {context.protocol}</span>
                  {context.safeCode && <span>Safe Code: {context.safeCode}</span>}
                </div>
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
