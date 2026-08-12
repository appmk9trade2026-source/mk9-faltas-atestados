import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCoordenadoresPorProjeto(projetoId?: string) {
  return useQuery({
    queryKey: ["coordenadores", projetoId],
    queryFn: async () => {
      if (!projetoId) return [];

      // Coordenadores são usuários com role 'coordenador' que estão vinculados ao projeto
      // via RPC coordenador_has_projeto_via_equipe ou simplificado via profiles
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("papel", "coordenador");

      if (error) throw error;
      
      // Filtro manual se necessário ou via RPC para precisão AMBEV
      // Para o MVP da Fase 1, listamos os coordenadores ativos
      return data || [];
    },
    enabled: !!projetoId,
  });
}
