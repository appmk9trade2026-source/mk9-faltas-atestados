import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";

export type ProjetoOption = { id: string; nome: string; codigo_protocolo: string | null };

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
      const { data, error } = await supabase.rpc("get_projetos_ativos_por_empresa", {
        _empresa_id: empresaId,
      });
      if (error) throw error;
      return (data ?? []) as ProjetoOption[];
    },
  });
}
