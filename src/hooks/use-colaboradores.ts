import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ColaboradorAtivo = {
  id: string;
  nome_completo: string;
  matricula: string;
  empresa_id: string;
  projeto_id: string;
  cargo: string | null;
};

export type ColaboradoresFiltros = {
  empresaId?: string | null;
  projetoId?: string | null;
  busca?: string | null;
};

/**
 * Hook reutilizável para módulos futuros (Nova Ausência, filtros, dashboard).
 * Retorna somente colaboradores ativos, ordenados por nome.
 */
export function useColaboradoresAtivos(filtros: ColaboradoresFiltros = {}) {
  const { empresaId, projetoId, busca } = filtros;
  return useQuery({
    queryKey: ["colaboradores", "ativos", empresaId ?? null, projetoId ?? null, busca ?? ""],
    queryFn: async (): Promise<ColaboradorAtivo[]> => {
      const { data, error } = await supabase.rpc("get_colaboradores_ativos", {
        _empresa_id: empresaId ?? undefined,
        _projeto_id: projetoId ?? undefined,
        _busca: busca ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as ColaboradorAtivo[];
    },
  });
}
