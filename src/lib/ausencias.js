import { supabase } from "@/integrations/supabase/client";
export const TIPO_AUSENCIA = ["FALTA", "ATESTADO", "DECLARACAO", "SUSPENSAO", "OUTROS"];
export const STATUS_AUSENCIA = ["PENDENTE", "LANCADO", "SUBSTITUIDA", "CANCELADO"];
export const STATUS_PROCESSAMENTO = ["AGUARDANDO", "EM_PROCESSAMENTO", "PROCESSADO"];
export const TIPO_LABEL = {
    FALTA: "Falta",
    ATESTADO: "Atestado",
    DECLARACAO: "Declaração",
    SUSPENSAO: "Suspensão",
    OUTROS: "Outros",
};
/** Lista completa de tipos detalhados exibidos no formulário. */
export const TIPO_AUSENCIA_DETALHE = [
    "ATESTADO MÉDICO (Conforme descrição do documento)",
    "ATESTADO DE ACOMPANHAMENTO (Filho menor de idade)",
    "ATESTADO ODONTOLÓGICO",
    "ATESTADO DE COMPARECIMENTO (Horas)",
    "DECLARAÇÃO DE COMPARECIMENTO",
    "FALTA INJUSTIFICADA",
    "FALTA JUSTIFICADA",
    "LICENÇA NOJO (2 dias consecutivos)",
    "LICENÇA GALA - CASAMENTO (3 dias consecutivos)",
    "LICENÇA PATERNIDADE (5 dias consecutivos)",
    "LICENÇA MATERNIDADE (120 dias consecutivos)",
    "AFASTAMENTO INSS - DOENÇA",
    "AFASTAMENTO INSS - ACIDENTE",
    "SUSPENSÃO DISCIPLINAR",
    "ABANDONO DE EMPREGO",
    "DOAÇÃO DE SANGUE",
    "ALISTAMENTO MILITAR",
    "CONVOCAÇÃO JUDICIAL",
    "OUTROS",
];
/** Mapeia o tipo detalhado para o tipo base (enum) usado em regras e templates. */
export function tipoBaseFromDetalhe(detalhe) {
    const d = detalhe.toUpperCase();
    if (d.startsWith("ATESTADO"))
        return "ATESTADO";
    if (d.startsWith("DECLARAÇÃO") || d.startsWith("DECLARACAO"))
        return "DECLARACAO";
    if (d.startsWith("FALTA"))
        return "FALTA";
    if (d.startsWith("SUSPENSÃO") || d.startsWith("SUSPENSAO"))
        return "SUSPENSAO";
    return "OUTROS";
}
/** Opções de quantidade de dias exibidas no formulário. */
export const QUANTIDADE_DIAS_OPTIONS = [
    "1 DIA",
    "2 DIAS (VÁLIDO SOMENTE PARA ATESTADO)",
    "3 DIAS (VÁLIDO SOMENTE PARA ATESTADO)",
    "4 DIAS",
    "5 DIAS (VÁLIDO SOMENTE PARA ATESTADO)",
    "6 DIAS",
    "7 DIAS",
    "8 DIAS",
    "9 DIAS",
    "10 DIAS",
    "11 DIAS",
    "12 DIAS",
    "13 DIAS",
    "14 DIAS",
    "15 DIAS",
    "16 DIAS",
    "17 DIAS",
    "18 DIAS",
    "19 DIAS",
    "20 DIAS",
    "21 DIAS",
    "30 DIAS",
    "45 DIAS",
    "60 DIAS",
    "90 DIAS",
    "120 DIAS (LICENÇA MATERNIDADE)",
    "180 DIAS (LICENÇA MATERNIDADE ESTENDIDA)",
    "PERÍODO INTEGRAL (AFASTAMENTO INSS)",
    "MEIO PERÍODO (HORAS)",
];
/**
 * Extrai o número de dias do rótulo. Retorna null para períodos não numéricos
 * (ex.: "PERÍODO INTEGRAL", "MEIO PERÍODO").
 */
export function diasFromLabel(label) {
    const m = label.match(/^(\d+)\s*DIA/i);
    return m ? parseInt(m[1], 10) : null;
}
export const ARQUIVO_MIMES = ["application/pdf", "image/png", "image/jpeg"];
export const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;
export const BUCKET_ATESTADOS = "atestados";
export function isTipoAusencia(v) {
    return TIPO_AUSENCIA.includes(v);
}
export async function getSignedAtestadoUrl(path, expiresIn = 60) {
    const { data, error } = await supabase.storage
        .from(BUCKET_ATESTADOS)
        .createSignedUrl(path, expiresIn);
    if (error)
        throw error;
    return data.signedUrl;
}
