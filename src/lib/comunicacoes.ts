import type { TipoAusencia } from "./ausencias";

export const CANAL_COMUNICACAO = ["EMAIL", "WHATSAPP", "SMS", "INTERNO"] as const;
export type CanalComunicacao = (typeof CANAL_COMUNICACAO)[number];

export const STATUS_COMUNICACAO = ["RASCUNHO", "APROVADO", "ENVIADO", "ERRO"] as const;
export type StatusComunicacao = (typeof STATUS_COMUNICACAO)[number];

export const CANAL_LABEL: Record<CanalComunicacao, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  INTERNO: "Interno",
};

export const STATUS_LABEL: Record<StatusComunicacao, string> = {
  RASCUNHO: "Rascunho",
  APROVADO: "Aprovado",
  ENVIADO: "Enviado",
  ERRO: "Erro",
};

const TEMPLATES: Record<TipoAusencia, { assunto: string; corpo: string }> = {
  ATESTADO: {
    assunto: "Recebimento de atestado",
    corpo:
      "Olá, {{nome}}.\n\nConfirmamos o recebimento do documento referente à sua ausência.\nO documento será analisado pelo setor responsável.\nCaso seja necessário complementar alguma informação entraremos em contato.\n\nObrigado.",
  },
  FALTA: {
    assunto: "Registro de ausência",
    corpo:
      "Olá, {{nome}}.\n\nInformamos que foi registrado um apontamento de ausência referente ao dia {{data}}.\nCaso exista alguma divergência, entre em contato com o RH.\n\nObrigado.",
  },
  DECLARACAO: {
    assunto: "Recebimento de declaração",
    corpo:
      "Olá, {{nome}}.\n\nRegistramos o documento apresentado referente à ausência informada.\nCaso seja necessário algum complemento entraremos em contato.",
  },
  SUSPENSAO: {
    assunto: "Atualização administrativa",
    corpo:
      "Olá, {{nome}}.\n\nExiste uma atualização administrativa referente ao seu registro.\nEntre em contato com o RH para mais informações.",
  },
  OUTROS: {
    assunto: "Comunicação",
    corpo: "Olá, {{nome}}.\n\n",
  },
};

export function renderTemplate(
  tipo: TipoAusencia,
  vars: { nome: string; data?: string | null },
): { assunto: string; corpo: string } {
  const t = TEMPLATES[tipo];
  const data = vars.data
    ? new Date(vars.data + "T00:00:00").toLocaleDateString("pt-BR")
    : "";
  const replace = (s: string) =>
    s.replaceAll("{{nome}}", vars.nome || "").replaceAll("{{data}}", data);
  return { assunto: replace(t.assunto), corpo: replace(t.corpo) };
}

export function defaultDestinatario(
  canal: CanalComunicacao,
  colab: { email?: string | null; telefone?: string | null; whatsapp?: string | null } | null | undefined,
): string {
  if (!colab) return "";
  if (canal === "EMAIL") return colab.email ?? "";
  if (canal === "WHATSAPP") return colab.whatsapp ?? colab.telefone ?? "";
  if (canal === "SMS") return colab.telefone ?? "";
  return colab.email ?? "";
}
