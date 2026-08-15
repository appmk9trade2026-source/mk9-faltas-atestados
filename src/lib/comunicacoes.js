export const CANAL_COMUNICACAO = ["EMAIL", "WHATSAPP", "SMS", "INTERNO"];
export const STATUS_COMUNICACAO = ["RASCUNHO", "APROVADO", "ENVIADO", "ERRO"];
export const CANAL_LABEL = {
    EMAIL: "E-mail",
    WHATSAPP: "WhatsApp",
    SMS: "SMS",
    INTERNO: "Interno",
};
export const STATUS_LABEL = {
    RASCUNHO: "Rascunho",
    APROVADO: "Aprovado",
    ENVIADO: "Enviado",
    ERRO: "Erro",
};
const TEMPLATES = {
    ATESTADO: {
        assunto: "Recebimento de atestado",
        corpo: "Olá, {{nome}}.\n\nConfirmamos o recebimento do documento referente à sua ausência.\nO documento será analisado pelo setor responsável.\nCaso seja necessário complementar alguma informação entraremos em contato.\n\nObrigado.",
    },
    FALTA: {
        assunto: "Registro de ausência",
        corpo: "Olá, {{nome}}.\n\nInformamos que foi registrado um apontamento de ausência referente ao dia {{data}}.\nCaso exista alguma divergência, entre em contato com o RH.\n\nObrigado.",
    },
    DECLARACAO: {
        assunto: "Recebimento de declaração",
        corpo: "Olá, {{nome}}.\n\nRegistramos o documento apresentado referente à ausência informada.\nCaso seja necessário algum complemento entraremos em contato.",
    },
    SUSPENSAO: {
        assunto: "Atualização administrativa",
        corpo: "Olá, {{nome}}.\n\nExiste uma atualização administrativa referente ao seu registro.\nEntre em contato com o RH para mais informações.",
    },
    OUTROS: {
        assunto: "Comunicação",
        corpo: "Olá, {{nome}}.\n\n",
    },
};
export function renderTemplate(tipo, vars) {
    const t = TEMPLATES[tipo];
    const data = vars.data
        ? new Date(vars.data + "T00:00:00").toLocaleDateString("pt-BR")
        : "";
    const replace = (s) => s.replaceAll("{{nome}}", vars.nome || "").replaceAll("{{data}}", data);
    return { assunto: replace(t.assunto), corpo: replace(t.corpo) };
}
export function defaultDestinatario(canal, colab) {
    if (!colab)
        return "";
    if (canal === "EMAIL")
        return colab.email ?? "";
    if (canal === "WHATSAPP")
        return colab.whatsapp ?? colab.telefone ?? "";
    if (canal === "SMS")
        return colab.telefone ?? "";
    return colab.email ?? "";
}
