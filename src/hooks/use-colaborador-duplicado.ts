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

export type DuplicidadeStatus =
  | "idle"
  | "checking"
  | "available"
  | "duplicate"
  | "error";

export type UseColaboradorDuplicadoResult = {
  status: DuplicidadeStatus;
  duplicado: ColaboradorDuplicado | null;
  errorMessage: string | null;
  /** true enquanto o React Query está resolvendo a versão atual da chave */
  checking: boolean;
};

/**
 * Debounced live-check de unicidade (empresa_id + matrícula normalizada).
 * Reutiliza a mesma regra usada pelo banco (`public.normalize_matricula`).
 *
 * Estados explícitos: idle | checking | available | duplicate | error.
 * Nunca considera a matrícula como "available" quando a consulta falha —
 * a UI deve exibir mensagem de erro e o Salvar deve permanecer bloqueado.
 */
export function useColaboradorDuplicado(
  empresaId: string | null | undefined,
  matricula: string | null | undefined,
  excludeId?: string | null,
): UseColaboradorDuplicadoResult {
  const [debounced, setDebounced] = useState({ empresaId, matricula });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ empresaId, matricula }), 350);
    return () => clearTimeout(t);
  }, [empresaId, matricula]);

  const mat = normalizeMatricula(debounced.matricula);
  const emp = debounced.empresaId ?? "";
  const enabled = !!emp && mat.length > 0;

  // Também detecta "usuário ainda digitando" — os valores atuais divergem
  // do último snapshot debounced, então o resultado exibido está defasado.
  const pendingDebounce =
    enabled &&
    (empresaId !== debounced.empresaId ||
      normalizeMatricula(matricula) !== mat);

  const q = useQuery({
    queryKey: ["colab-duplicado", emp, mat, excludeId ?? null],
    enabled,
    // Sem cache longo: mudanças de RLS / de dados devem refletir imediatamente.
    staleTime: 0,
    gcTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ColaboradorDuplicado | null> => {
      let query = supabase
        .from("colaboradores")
        .select(
          "id, nome_completo, matricula, ativo, supervisor_nome, empresa:empresas(id,nome), projeto:projetos(id,nome)",
        )
        .eq("empresa_id", emp)
        .eq("matricula", mat)
        .limit(1);
      if (excludeId) query = query.neq("id", excludeId);
      const { data, error } = await query.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as unknown as ColaboradorDuplicado) ?? null;
    },
  });

  let status: DuplicidadeStatus;
  if (!enabled) status = "idle";
  else if (q.isError) status = "error";
  else if (q.isFetching || pendingDebounce) status = "checking";
  else if (q.data) status = "duplicate";
  else if (q.isSuccess) status = "available";
  else status = "checking";

  return {
    status,
    duplicado: status === "duplicate" ? (q.data ?? null) : null,
    errorMessage:
      status === "error"
        ? "Não foi possível verificar a matrícula. Tente novamente."
        : null,
    checking: status === "checking",
  };
}
