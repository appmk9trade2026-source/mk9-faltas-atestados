// Resolvedor de períodos para o Assistente. Todos os cálculos são feitos
// em UTC para persistência, mas o usuário pode informar timezone quando
// pedimos "hoje". Como o CRM opera em America/Sao_Paulo por padrão, esse é
// o fallback.
const DEFAULT_TZ = "America/Sao_Paulo";
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function startOfMonth(d) {
    const x = new Date(d);
    x.setDate(1);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfMonth(d) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + 1, 0);
    x.setHours(23, 59, 59, 999);
    return x;
}
export function resolverPeriodo(input) {
    const agora = new Date();
    const preset = input?.preset ?? "HOJE";
    if (preset === "PERSONALIZADO" && input?.inicio && input?.fim) {
        return {
            inicio: new Date(input.inicio).toISOString(),
            fim: new Date(input.fim).toISOString(),
            label: `${input.inicio} até ${input.fim}`,
        };
    }
    switch (preset) {
        case "HOJE":
            return { inicio: startOfDay(agora).toISOString(), fim: endOfDay(agora).toISOString(), label: "Hoje" };
        case "ONTEM": {
            const y = addDays(agora, -1);
            return { inicio: startOfDay(y).toISOString(), fim: endOfDay(y).toISOString(), label: "Ontem" };
        }
        case "ULTIMOS_7_DIAS":
            return {
                inicio: startOfDay(addDays(agora, -6)).toISOString(),
                fim: endOfDay(agora).toISOString(),
                label: "Últimos 7 dias",
            };
        case "MES_ATUAL":
            return {
                inicio: startOfMonth(agora).toISOString(),
                fim: endOfDay(agora).toISOString(),
                label: "Mês atual",
            };
        case "MES_ANTERIOR": {
            const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 15);
            return {
                inicio: startOfMonth(anterior).toISOString(),
                fim: endOfMonth(anterior).toISOString(),
                label: "Mês anterior",
            };
        }
        default:
            return { inicio: startOfDay(agora).toISOString(), fim: endOfDay(agora).toISOString(), label: "Hoje" };
    }
}
/** Retorna o período imediatamente anterior de mesma duração, para comparações. */
export function periodoAnterior(p) {
    const inicio = new Date(p.inicio).getTime();
    const fim = new Date(p.fim).getTime();
    const dur = fim - inicio;
    return {
        inicio: new Date(inicio - dur - 1).toISOString(),
        fim: new Date(inicio - 1).toISOString(),
        label: `Anterior (${new Date(inicio - dur - 1).toISOString().slice(0, 10)}–${new Date(inicio - 1).toISOString().slice(0, 10)})`,
    };
}
export const TIMEZONE_DEFAULT = DEFAULT_TZ;
