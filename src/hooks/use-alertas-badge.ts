import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { obterContagemAlertasMenu } from "@/lib/alertas.functions";

export function useAlertasBadge() {
  const fn = useServerFn(obterContagemAlertasMenu);
  return useQuery({
    queryKey: ["alertas", "contagem"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function formatBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
