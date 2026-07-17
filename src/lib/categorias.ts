import { supabase } from "@/integrations/supabase/client";

export type Categoria = {
  id: string;
  codigo: string;
  nome: string;
  cor: string | null;
  icone: string | null;
  ordem: number;
  ativo: boolean;
};

export type TipoComCategoria = {
  id: string;
  codigo: string;
  nome: string;
  cor: string | null;
  ativo: boolean;
  categoria_ausencia_id: string | null;
};

/** Cores oficiais MK9 por categoria (fallback). */
export const CATEGORIA_CORES: Record<string, string> = {
  ATESTADOS: "#2563eb",
  FALTAS: "#dc2626",
  LICENCAS: "#16a34a",
  AFASTAMENTOS: "#7c3aed",
  MEDIDAS_ADMINISTRATIVAS: "#ea580c",
  OUTROS: "#6b7280",
};

export const CATEGORIA_LABELS: Record<string, string> = {
  ATESTADOS: "Atestados",
  FALTAS: "Faltas",
  LICENCAS: "Licenças",
  AFASTAMENTOS: "Afastamentos",
  MEDIDAS_ADMINISTRATIVAS: "Medidas Administrativas",
  OUTROS: "Outros",
};

export async function fetchCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from("categorias_ausencia" as never)
    .select("*")
    .eq("ativo", true)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Categoria[];
}

export async function fetchTiposComCategoria(): Promise<TipoComCategoria[]> {
  const { data, error } = await supabase
    .from("tipos_ausencia" as never)
    .select("id, codigo, nome, cor, ativo, categoria_ausencia_id")
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TipoComCategoria[];
}
