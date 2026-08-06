import { createHash } from "crypto";

export type OperationMetadata = {
  ip?: string;
  userAgent?: string;
  os?: string;
  browser?: string;
  deviceType?: string;
};

/**
 * Calcula o hash de integridade de um registro de ausência.
 * Inclui campos críticos e o hash anterior para cadeia de custódia.
 */
export function calculateIntegrityHash(data: any, previousHash: string | null = null): string {
  const salt = process.env['HASH_SALT'] || 'sigec-mk9-forensic-2026';
  const payload = JSON.stringify({
    colaborador_id: data.colaborador_id,
    data_inicio: data.data_inicio,
    data_fim: data.data_fim,
    tipo: data.tipo,
    motivo: data.motivo,
    empresa_id: data.empresa_id,
    projeto_id: data.projeto_id,
    previousHash,
    salt
  });
  
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Resolve metadados da requisição para auditoria.
 */
export function resolveOperationMetadata(request: Request): OperationMetadata {
  const ua = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '';
  
  // Detecção simples de OS/Browser/Device (em prod usaríamos uma lib como ua-parser-js)
  let os = "Desconhecido";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let browser = "Outro";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";

  let deviceType = "Desktop";
  if (/Mobile|Android|iPhone/i.test(ua)) deviceType = "Mobile";
  else if (/Tablet|iPad/i.test(ua)) deviceType = "Tablet";

  return {
    ip,
    userAgent: ua,
    os,
    browser,
    deviceType
  };
}
