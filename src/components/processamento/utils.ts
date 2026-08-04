import { differenceInDays } from "date-fns";

export function calcularPrioridade(registradoEm: string): "NORMAL" | "ATENCAO" | "CRITICO" {
  const dias = differenceInDays(new Date(), new Date(registradoEm));
  if (dias >= 4) return "CRITICO";
  if (dias >= 2) return "ATENCAO";
  return "NORMAL";
}

export function getSlaStatus(registradoEm: string): "DENTRO" | "ATENCAO" | "FORA" {
  const dias = differenceInDays(new Date(), new Date(registradoEm));
  if (dias >= 4) return "FORA";
  if (dias >= 2) return "ATENCAO";
  return "DENTRO";
}

export function getPrioridadeLabel(p: "NORMAL" | "ATENCAO" | "CRITICO") {
  switch (p) {
    case "CRITICO": return { label: "Crítico", color: "text-red-600 bg-red-50 dark:bg-red-900/20", icon: "🔴" };
    case "ATENCAO": return { label: "Atenção", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20", icon: "🟡" };
    default: return { label: "Normal", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20", icon: "🟢" };
  }
}
