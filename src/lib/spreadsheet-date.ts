// Parser central de datas vindas de planilhas (XLSX/CSV).
// Aceita:
//   - Date válido
//   - number (serial Excel — dias desde 1899-12-30)
//   - string "YYYY-MM-DD"
//   - string "DD/MM/YYYY"
//   - string ISO com horário ("2026-07-21T00:00:00.000Z")
// Retorna sempre uma data civil "YYYY-MM-DD" (sem timezone), ou:
//   - null   → célula vazia
//   - "INVALID" → valor não reconhecido
//
// Evita o clássico bug de fuso: 21/07/2026 nunca vira 20/07/2026.

export type ParsedDate = string | null | "INVALID";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fromYMD(y: number, m: number, d: number): ParsedDate {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "INVALID";
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "INVALID";
  // Verifica se a data existe de fato (ex.: 31/02 não existe)
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return "INVALID";
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

function fromExcelSerial(serial: number): ParsedDate {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return "INVALID";
  // Excel/1900: dia 1 = 1900-01-01. Bug histórico: 1900 é tratado como bissexto.
  // Fórmula usada pela lib xlsx: date = new Date(Date.UTC(1899,11,30) + serial*86400000).
  const ms = Math.round(serial * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  return fromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseSpreadsheetDate(value: unknown): ParsedDate {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "INVALID";
    // Trata como data civil no fuso local (assim 21/07 digitado no Excel permanece 21/07)
    return fromYMD(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    return fromExcelSerial(value);
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return null;

    // YYYY-MM-DD
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return fromYMD(+m[1], +m[2], +m[3]);

    // DD/MM/YYYY  (também aceita D/M/YYYY)
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return fromYMD(+m[3], +m[2], +m[1]);

    // DD-MM-YYYY
    m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
    if (m) return fromYMD(+m[3], +m[2], +m[1]);

    // ISO com horário: pega só a parte da data (evita drift de timezone)
    m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s);
    if (m) return fromYMD(+m[1], +m[2], +m[3]);

    // Serial numérico como string
    if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));

    return "INVALID";
  }

  return "INVALID";
}
