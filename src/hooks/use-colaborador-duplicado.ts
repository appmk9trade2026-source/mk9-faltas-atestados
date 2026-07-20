import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeMatricula } from "@/lib/matricula";

export type ColaboradorDuplicado = {
  id: string;
  nome_completo: string;
  matricula: string;
  ativo: boolean;
  empresa: { id: string; nome: string } | null;
  projeto: { id: string; nome: string } | null;
  supervisor_nome: string | null;
};

/**
 * Debounced live-check de unicidade (empresa_id + matrícula normalizada).
 * Reutiliza a mesma regra usada pelo banco (`public.normalize_matricula`).
 */
export function useColaboradorDuplicado(
  empresaId: string | null | undefined,
  matricula: string | null | undefined,
  excludeId?: string | null,
) {
  const [debounced, setDebounced] = useState({ empresaId, matricula });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ empresaId, matricula }), 350);
    return () => clearTimeout(t);
  }, [empresaId, matricula]);

  const mat = normalizeMatricula(debounced.matricula);
  const emp = debounced.empresaId ?? "";
  const enabled = !!emp && mat.length > 0;

  return useQuery({
    queryKey: ["colab-duplicado", emp, mat, excludeId ?? null],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<ColaboradorDuplicado | null> => {
      let q = supabase
        .from("colaboradores")
        .select(
          "id, nome_completo, matricula, ativo, supervisor_nome, empresa:empresas(id,nome), projeto:projetos(id,nome)",
        )
        .eq("empresa_id", emp)
        .eq("matricula", mat)
        .limit(1);
      if (excludeId) q = q.neq("id", excludeId);
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as unknown as ColaboradorDuplicado) ?? null;
    },
  });
}

