import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Error boundary padrão do módulo WhatsApp Admin.
 * — mensagem amigável
 * — nunca exibe stack trace
 * — botão "Tentar novamente" (router.invalidate + reset)
 * — sem redirect/fallback para o Dashboard principal
 * — respeita tema claro/escuro/sistema (tokens semânticos)
 */
export function WhatsappRouteError({
  error,
  reset,
  title = "Não foi possível carregar esta página.",
}: {
  error: Error;
  reset: () => void;
  title?: string;
}) {
  const router = useRouter();
  // Sanitiza: nunca exibir stack trace nem payloads sensíveis.
  const safeMessage =
    (error?.message ?? "").replace(/\s+/g, " ").trim().slice(0, 160) ||
    "Ocorreu um erro inesperado.";

  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{safeMessage}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    </Card>
  );
}

/**
 * NotFound boundary padrão do módulo WhatsApp Admin.
 */
export function WhatsappRouteNotFound({
  title = "Página não encontrada",
  description = "A página que você tentou acessar não existe ou foi movida.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/comunicacoes/whatsapp">
            <RefreshCw className="mr-2 h-4 w-4" /> Ir para WhatsApp Admin
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/**
 * Skeleton padrão para carregamento de páginas do módulo.
 * Nunca deixar tela branca.
 */
export function WhatsappRouteLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
