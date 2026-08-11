import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";

export type ProjetoOption = { id: string; nome: string; codigo_protocolo: string | null; empresa_id?: string };

/**
 * Hook reutilizável para dropdown dependente de Projeto x Empresa.
 * Retorna somente projetos ativos, em ordem alfabética.
 * Escopo da sessão entra na queryKey para não vazar cache entre usuários.
 */
export function useProjetosAtivosPorEmpresa(empresaId: string | null | undefined) {
  const scope = useSessionScope();
  return useQuery({
    queryKey: ["projetos", "ativos", ...scope.keyParts, empresaId ?? "none"],
    enabled: scope.ready && !!empresaId,
    queryFn: async (): Promise<ProjetoOption[]> => {
      if (!empresaId) return [];
      // Leitura direta na tabela: o RLS de `projetos` já aplica o predicado canônico
      // (vínculo direto via user_has_projeto + vínculo via equipe de supervisor/coordenador
      // + acessos de rh/compliance/super_admin). Evita o critério mais restrito da RPC.
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, codigo_protocolo")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjetoOption[];
    },
  });
}

