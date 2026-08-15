import { supabase } from "@/integrations/supabase/client";
/** Cores oficiais MK9 por categoria (fallback). */
export const CATEGORIA_CORES = {
    ATESTADOS: "#2563eb",
    FALTAS: "#dc2626",
    LICENCAS: "#16a34a",
    AFASTAMENTOS: "#7c3aed",
    MEDIDAS_ADMINISTRATIVAS: "#ea580c",
    OUTROS: "#6b7280",
};
export const CATEGORIA_LABELS = {
    ATESTADOS: "Atestados",
    FALTAS: "Faltas",
    LICENCAS: "Licenças",
    AFASTAMENTOS: "Afastamentos",
    MEDIDAS_ADMINISTRATIVAS: "Medidas Administrativas",
    OUTROS: "Outros",
};
export async function fetchCategorias() {
    const { data, error } = await supabase
        .from("categorias_ausencia")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
    if (error)
        throw error;
    return (data ?? []);
}
export async function fetchTiposComCategoria() {
    const { data, error } = await supabase
        .from("tipos_ausencia")
        .select("id, codigo, nome, cor, ativo, categoria_ausencia_id")
        .order("ordem", { ascending: true });
    if (error)
        throw error;
    return (data ?? []);
}
