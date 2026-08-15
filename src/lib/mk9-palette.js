/**
 * Paleta oficial MK9 para gráficos.
 * Séries são derivadas dos tokens de marca (src/styles.css).
 * Para uso em `stroke`/`fill` de Recharts (que não resolvem CSS vars
 * automaticamente) expomos também os hex equivalentes.
 */
export const MK9_BRAND = {
    primary: "#009CDE", // azul claro
    primaryDark: "#006BA6", // azul institucional
    surfaceLight: "#F8F8F9", // branco gelo
    surfaceMuted: "#C9CBCB", // cinza médio
    surfaceDark: "#36424A", // cinza escuro
    surfaceDeep: "#191C1F", // preto grafite
};
/** Série padrão para gráficos institucionais (5 cores). */
export const MK9_CHART_SERIES = [
    MK9_BRAND.primary,
    MK9_BRAND.primaryDark,
    MK9_BRAND.surfaceMuted,
    MK9_BRAND.surfaceDark,
    MK9_BRAND.surfaceDeep,
];
/**
 * Paleta estendida — usa a série da marca e complementa com cores semânticas
 * já existentes no design system para casos com muitas séries.
 * Ordem prioriza contraste entre vizinhos.
 */
export const MK9_CHART_EXTENDED = [
    MK9_BRAND.primary,
    MK9_BRAND.primaryDark,
    "#10b981", // sucesso (semântico)
    "#f59e0b", // aviso  (semântico)
    MK9_BRAND.surfaceDark,
    "#ef4444", // erro   (semântico)
    MK9_BRAND.surfaceMuted,
    "#8b5cf6", // acento neutro
];
/** Cores por índice, com wrap-around seguro. */
export function mk9ChartColor(i, extended = false) {
    const arr = extended ? MK9_CHART_EXTENDED : MK9_CHART_SERIES;
    return arr[((i % arr.length) + arr.length) % arr.length];
}
