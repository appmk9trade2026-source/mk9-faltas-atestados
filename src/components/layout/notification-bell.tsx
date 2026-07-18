import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CircleAlert, CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useNotificacoes,
  useNotificacoesNaoLidas,
  useMarcarLida,
  type NotifSeveridade,
} from "@/hooks/use-notificacoes";
import { useState } from "react";

const sevStyle: Record<NotifSeveridade, string> = {
  INFO: "bg-muted text-muted-foreground",
  ATENCAO: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  ALTA: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  CRITICA: "bg-destructive/15 text-destructive",
};

function severityIcon(sev: NotifSeveridade) {
  if (sev === "CRITICA" || sev === "ALTA") return <CircleAlert className="h-4 w-4" />;
  return <CircleAlertIcon className="h-4 w-4" />;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = useNotificacoesNaoLidas();
  const { data: items = [], refetch, isFetching } = useNotificacoes(undefined, 8);
  const marcar = useMarcarLida();
  const navigate = useNavigate();

  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) refetch(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3">
          <div className="text-sm font-semibold">Notificações</div>
          <Badge variant="outline" className="text-[10px]">{count} não lidas</Badge>
        </div>
        <Separator />
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {isFetching ? "Carregando…" : "Nenhuma notificação."}
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className="p-3 hover:bg-accent/40 transition-colors">
                  <button
                    className="flex w-full items-start gap-2 text-left"
                    onClick={async () => {
                      if (n.status === "NAO_LIDA") await marcar.mutateAsync(n.id).catch(() => {});
                      setOpen(false);
                      if (n.rota_destino) navigate({ to: n.rota_destino });
                    }}
                  >
                    <span className={cn("mt-0.5 flex h-6 w-6 items-center justify-center rounded-md", sevStyle[n.severidade])}>
                      {severityIcon(n.severidade)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-xs font-medium truncate", n.status === "NAO_LIDA" && "font-semibold")}>{n.titulo}</p>
                        {n.status === "NAO_LIDA" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{n.mensagem}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR")} · {n.origem}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <Separator />
        <div className="p-2">
          <Button asChild variant="ghost" size="sm" className="w-full text-xs" onClick={() => setOpen(false)}>
            <Link to="/notificacoes">Ver todas</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
