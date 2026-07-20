import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProjetoOption = { id: string; nome: string; codigo_protocolo: string | null };

/**
 * Hook reutilizável para dropdown dependente de Projeto x Empresa.
 * Retorna somente projetos ativos, em ordem alfabética.
 * Uso futuro: Colaboradores, Nova Ausência, filtros e relatórios.
 */
export function useProjetosAtivosPorEmpresa(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["projetos", "ativos", empresaId ?? "none"],
    enabled: !!empresaId,
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
