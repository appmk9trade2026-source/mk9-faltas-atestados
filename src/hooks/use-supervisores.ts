import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";

export type SupervisorAtivo = {
  id: string;
  nome: string;
};

/**
 * Retorna supervisores ativos por projeto.
 */
export function useSupervisoresPorProjeto(projetoId: string | null) {
  const scope = useSessionScope();
  return useQuery({
    queryKey: ["supervisores", "projeto", projetoId, ...scope.keyParts],
    enabled: scope.ready && !!projetoId,
    queryFn: async (): Promise<SupervisorAtivo[]> => {
      const { data, error } = await supabase.rpc("get_supervisores_projeto", {
        _projeto_id: projetoId as any,
      });
      if (error) throw error;
      return (data ?? []) as SupervisorAtivo[];
    },
  });
}
