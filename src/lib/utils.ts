import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * HTML Guard: Detecta se uma resposta é HTML bruto em vez de JSON estruturado.
 */
export function isHtmlResponse(error: any): boolean {
  if (!error) return false;
  const msg = typeof error === 'string' ? error : error.message;
  return typeof msg === 'string' && (
    msg.trim().startsWith('<!DOCTYPE') || 
    msg.trim().startsWith('<html')
  );
}

/**
 * Sanitiza mensagens de erro do Zod para exibição amigável na UI.
 */
export function getFriendlyErrorMessage(error: any, fallback = "Ocorreu um erro inesperado."): string {
  if (isHtmlResponse(error)) {
    return "Erro Crítico: O servidor retornou uma resposta inválida (HTML).";
  }

  const message = typeof error === 'string' ? error : error.message;
  
  // Detecta se é um ZodError serializado (JSON string)
  if (typeof message === 'string' && message.includes('"code"') && message.includes('"path"')) {
    try {
      const parsed = JSON.parse(message);
      if (Array.isArray(parsed) && parsed[0]?.message) {
        return `Falha de validação: ${parsed[0].message}`;
      }
    } catch (e) {
      // Ignora erro de parse e segue para o fallback
    }
  }

  if (message?.includes("INVALID_PAYLOAD")) return message.replace("INVALID_PAYLOAD:", "Dados inválidos:").trim();
  if (message?.includes("CONFLICT")) return message.replace("CONFLICT:", "").trim();
  if (message?.includes("TECHNICAL_ERROR")) return "Falha técnica temporária. Tente novamente em instantes.";

  return message || fallback;
}
