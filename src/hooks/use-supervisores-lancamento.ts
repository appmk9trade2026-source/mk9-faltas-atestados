import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";

export type SupervisorLancamento = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
};

/**
 * Supervisores que o usuário autenticado pode usar ao lançar uma ausência.
 *
 * A resolução do escopo é feita 100% no banco (`supervisores_para_lancamento`):
 *  - super_admin / rh / compliance: todos os supervisores ativos;
 *  - coordenador: apenas supervisores da própria equipe (profiles.coordenador_usuario_id);
 *  - supervisor: apenas ele mesmo.
 *
 * Quando `projetoId` é informado, a lista fica restrita aos supervisores que
 * possuem colaboradores ativos naquele projeto.
 *
 * Isto é UX: a autorização real continua nas policies RLS e nas validações
 * server-side da RPC de lançamento.
 */
export function useSupervisoresLancamento(projetoId?: string | null, habilitado = true) {
  const scope = useSessionScope();
  return useQuery({
    queryKey: ["supervisores-lancamento", ...scope.keyParts, projetoId ?? "todos"],
    enabled: scope.ready && habilitado,
    staleTime: 60_000,
    queryFn: async (): Promise<SupervisorLancamento[]> => {
      const { data, error } = await supabase.rpc("supervisores_para_lancamento", {
        _projeto_id: projetoId ?? null,
      } as never);
      if (error) throw error;
      return (data ?? []) as SupervisorLancamento[];
    },
  });
}
