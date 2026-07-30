// Utilitários puros de retificação (client-safe, sem server functions).

/** Prazo de 24h calculado a partir de created_at (fonte: banco). */
export function prazoRetificacao(createdAt: string, agora: Date = new Date()) {
  const limite = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000);
  const restanteMs = limite.getTime() - agora.getTime();
  return { limite, restanteMs, expirado: restanteMs <= 0 };
}

/** Formata o tempo restante como "12h 34min". */
export function formatarRestante(ms: number): string {
  if (ms <= 0) return "expirado";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

/** Mapeia erros do banco para mensagens estáveis (sem vazar detalhe interno). */
export function mapRetificacaoError(message: string): string {
  if (/PRAZO_EXPIRADO/.test(message))
    return "A janela de 24 horas para retificação expirou. Solicite a correção ao RH ou Super Admin.";
  if (/PROJECT_SCOPE_DENIED/.test(message))
    return "Esta ausência está fora do seu escopo de projeto.";
  if (/DOCUMENTO_OBRIGATORIO/.test(message))
    return "O tipo selecionado exige documento anexado.";
  if (/PERMISSION_DENIED|insufficient_privilege|row-level security/i.test(message))
    return "Você não tem permissão para retificar esta ausência.";
  if (/RESOURCE_NOT_FOUND/.test(message)) return "Ausência não encontrada.";
  if (/INVALID_PAYLOAD|check_violation/.test(message))
    return message.replace(/^.*INVALID_PAYLOAD:\s*/, "") || "Dados inválidos para retificação.";
  return "Não foi possível concluir a retificação.";
}
