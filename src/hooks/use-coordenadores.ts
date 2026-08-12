import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCoordenadoresPorProjeto(projetoId?: string) {
  return useQuery({
    queryKey: ["coordenadores", projetoId],
    queryFn: async () => {
      if (!projetoId) return [];

      // Como o campo 'papel' não existe na tabela profiles (está na user_roles), 
      // e queremos buscar coordenadores vinculados ao projeto:
      // A tabela user_roles armazena os papéis.
      
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "coordenador");

      if (rolesError) throw rolesError;
      if (!rolesData || rolesData.length === 0) return [];

      const userIds = rolesData.map(r => r.user_id);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);

      if (error) throw error;
      
      return data || [];
    },
    enabled: !!projetoId,
  });
}
