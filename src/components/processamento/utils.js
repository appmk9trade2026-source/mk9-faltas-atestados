import { differenceInDays } from "date-fns";
export function calcularPrioridade(registradoEm) {
    const dias = differenceInDays(new Date(), new Date(registradoEm));
    if (dias >= 4)
        return "CRITICO";
    if (dias >= 2)
        return "ATENCAO";
    return "NORMAL";
}
export function getSlaStatus(registradoEm) {
    const dias = differenceInDays(new Date(), new Date(registradoEm));
    if (dias >= 4)
        return "FORA";
    if (dias >= 2)
        return "ATENCAO";
    return "DENTRO";
}
export function getPrioridadeLabel(p) {
    switch (p) {
        case "CRITICO": return { label: "Crítico", color: "text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200", icon: "🔴" };
        case "ATENCAO": return { label: "Atenção", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200", icon: "🟡" };
        default: return { label: "Normal", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200", icon: "🟢" };
    }
}
export function getSlaColor(registradoEm) {
    const dias = differenceInDays(new Date(), new Date(registradoEm));
    if (dias >= 4)
        return "bg-red-500 text-white"; // Fora SLA
    if (dias >= 3)
        return "bg-orange-500 text-white"; // Vence hoje
    if (dias >= 2)
        return "bg-amber-400 text-black"; // Até 24h
    return "bg-emerald-500 text-white"; // Dentro SLA
}
