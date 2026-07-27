/**
 * Política de senha definitiva do CRM MK9.
 *
 * Compartilhada entre cliente (feedback imediato) e servidor (fonte da verdade).
 * Nunca registra, retorna ou serializa a senha avaliada — apenas o veredito.
 */

/** Senhas triviais/vazadas mais comuns em bases brasileiras e globais. */
const SENHAS_COMUNS = new Set([
  "12345678", "123456789", "1234567890", "123456", "1234567", "senha123",
  "password", "password1", "password123", "qwerty123", "qwertyui", "asdf1234",
  "abc12345", "admin123", "mudar123", "trocar123", "brasil123", "mk912345",
  "iloveyou", "sunshine", "princess", "football", "monkey123", "master123",
  "letmein123", "welcome1", "welcome123", "senha1234", "102030405", "1q2w3e4r",
]);

function ehSequencia(pw: string): boolean {
  const s = pw.toLowerCase();
  if (s.length < 4) return false;
  // Todos os caracteres iguais.
  if (/^(.)\1+$/.test(s)) return true;
  // Sequência numérica ou alfabética crescente/decrescente em toda a senha.
  let cres = true;
  let decr = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) cres = false;
    if (d !== -1) decr = false;
  }
  if (cres || decr) return true;
  // Trecho sequencial longo (>= 6 caracteres) em qualquer posição.
  let run = 1;
  let runDec = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    run = d === 1 ? run + 1 : 1;
    runDec = d === -1 ? runDec + 1 : 1;
    if (run >= 6 || runDec >= 6) return true;
  }

  // Padrões de teclado.
  const teclado = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
  return teclado.some((linha) => linha.includes(s) || [...linha].reverse().join("").includes(s));
}

function normalizaComparacao(v: string): string {
  return v.trim().toLowerCase();
}

export type ContextoSenha = {
  /** Senha temporária digitada no primeiro acesso (quando conhecida). */
  senhaTemporaria?: string | null;
  email?: string | null;
  matricula?: string | null;
  nome?: string | null;
};

export type ResultadoSenha = { ok: true } | { ok: false; motivo: string };

/**
 * Regras estruturais + contextuais. Não faz chamadas de rede.
 */
export function validarSenhaDefinitiva(pw: string, ctx: ContextoSenha = {}): ResultadoSenha {
  if (pw.length < 8) return { ok: false, motivo: "A senha deve ter pelo menos 8 caracteres." };
  if (pw.length > 72) return { ok: false, motivo: "A senha deve ter no máximo 72 caracteres." };
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    return { ok: false, motivo: "A senha deve conter letras e números." };
  }
  if (SENHAS_COMUNS.has(pw.toLowerCase())) {
    return { ok: false, motivo: "Esta senha é muito comum. Escolha uma senha exclusiva." };
  }
  if (ehSequencia(pw)) {
    return { ok: false, motivo: "Evite sequências simples ou repetições (ex.: 12345678, abcdefgh)." };
  }
  if (ctx.senhaTemporaria && pw === ctx.senhaTemporaria) {
    return { ok: false, motivo: "A nova senha deve ser diferente da senha temporária." };
  }
  if (ctx.email) {
    const email = normalizaComparacao(ctx.email);
    const local = email.split("@")[0] ?? "";
    const dominio = (email.split("@")[1] ?? "").split(".")[0] ?? "";
    const p = normalizaComparacao(pw);
    if (
      p === email ||
      (local.length >= 4 && p.includes(local)) ||
      (dominio.length >= 4 && local.length >= 3 && p.includes(dominio) && p.includes(local.slice(0, 3)))
    ) {
      return { ok: false, motivo: "A senha não pode ser baseada no seu e-mail." };
    }
  }
  if (ctx.matricula) {
    const mat = normalizaComparacao(ctx.matricula);
    if (mat.length >= 3 && normalizaComparacao(pw).includes(mat)) {
      return { ok: false, motivo: "A senha não pode ser baseada na sua matrícula." };
    }
  }
  if (ctx.nome) {
    const partes = normalizaComparacao(ctx.nome).split(/\s+/).filter((x) => x.length >= 5);
    const p = normalizaComparacao(pw);
    if (partes.some((parte) => p.includes(parte))) {
      return { ok: false, motivo: "A senha não pode conter seu nome." };
    }
  }

  return { ok: true };
}

/**
 * Verificação de vazamento (Have I Been Pwned) por k-anonimato: envia apenas
 * os 5 primeiros caracteres do SHA-1; a senha nunca sai do servidor.
 * Aplicada SOMENTE na senha definitiva — o fluxo de senha temporária
 * administrativa continua liberado.
 *
 * Falha de rede nunca bloqueia a troca legítima (retorna `false`).
 */
export async function senhaVazada(pw: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(pw);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefixo = hash.slice(0, 5);
    const sufixo = hash.slice(5);
    const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!resp.ok) return false;
    const texto = await resp.text();
    for (const linha of texto.split("\n")) {
      const [suf, cont] = linha.trim().split(":");
      if (suf === sufixo && Number(cont ?? 0) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
