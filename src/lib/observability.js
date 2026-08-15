// Lightweight client-side observability for Fase 8.
// Stores anonymous, non-sensitive events in localStorage (ring buffer).
// Do NOT log request/response payloads, IDs of business entities, tokens, or user emails.
const KEY = "mk9.observability.v1";
const MAX = 500;
function read() {
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function write(events) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX)));
        window.dispatchEvent(new CustomEvent("mk9:obs"));
    }
    catch {
        /* ignore quota */
    }
}
export function logEvent(ev) {
    if (typeof window === "undefined")
        return;
    const events = read();
    events.push({ ...ev, ts: new Date().toISOString() });
    write(events);
}
export function listEvents() {
    if (typeof window === "undefined")
        return [];
    return read().slice().reverse();
}
export function clearEvents() {
    if (typeof window === "undefined")
        return;
    write([]);
}
export async function trackRpc(acao, fn, detalhe) {
    const start = performance.now();
    try {
        const result = await fn();
        logEvent({
            categoria: "rpc",
            acao,
            resultado: "ok",
            duracao_ms: Math.round(performance.now() - start),
            detalhe,
        });
        return result;
    }
    catch (err) {
        logEvent({
            categoria: "rpc",
            acao,
            resultado: "erro",
            duracao_ms: Math.round(performance.now() - start),
            detalhe: err instanceof Error ? err.message.slice(0, 120) : "erro desconhecido",
        });
        throw err;
    }
}
export function trackScreenLoad(tela, duracaoMs, ok = true) {
    logEvent({
        categoria: "tela",
        acao: tela,
        resultado: ok ? "ok" : "erro",
        duracao_ms: Math.round(duracaoMs),
    });
}
export function trackExport(nome, formato, linhas, ok = true) {
    logEvent({
        categoria: "exportacao",
        acao: `${nome}.${formato}`,
        resultado: ok ? "ok" : "erro",
        duracao_ms: 0,
        detalhe: `${linhas} linhas`,
    });
}
export function summarize(events) {
    const byAction = new Map();
    for (const e of events) {
        const cur = byAction.get(e.acao) ?? { count: 0, total: 0, erros: 0, max: 0 };
        cur.count++;
        cur.total += e.duracao_ms;
        cur.max = Math.max(cur.max, e.duracao_ms);
        if (e.resultado === "erro" || e.resultado === "timeout")
            cur.erros++;
        byAction.set(e.acao, cur);
    }
    return Array.from(byAction.entries())
        .map(([acao, s]) => ({
        acao,
        execucoes: s.count,
        media_ms: Math.round(s.total / Math.max(1, s.count)),
        max_ms: s.max,
        erros: s.erros,
        taxa_erro: s.count ? s.erros / s.count : 0,
    }))
        .sort((a, b) => b.media_ms - a.media_ms);
}
