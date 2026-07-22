import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";

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
 * Retorna colaboradores ativos ordenados por nome.
 * Segurança de escopo é aplicada por RLS no banco:
 *  - Supervisor vê somente registros com supervisor_usuario_id = auth.uid().
 * O escopo da sessão entra na queryKey para evitar reuso de cache entre usuários.
 */
export function useColaboradoresAtivos(filtros: ColaboradoresFiltros = {}) {
  const { empresaId, projetoId, busca } = filtros;
  const scope = useSessionScope();
  return useQuery({
    queryKey: [
      "colaboradores",
      "ativos",
      ...scope.keyParts,
      empresaId ?? null,
      projetoId ?? null,
      busca ?? "",
    ],
    enabled: scope.ready,
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
