import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { MessageSquare, Plus, FileText, History, HelpCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSupport } from "./support-provider";
import { useSession } from "@/hooks/use-session";
import { useQuery } from "@tanstack/react-query";
import { getUnreadSupportCount } from "@/lib/support.functions";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";


export function SupportFAB() {
  const { openSupport } = useSupport();
  const { roles } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  // Perfis autorizados conforme RBAC canônico
  const isAuthorized = roles.some(r => ["super_admin", "rh", "supervisor", "coordenador", "compliance"].includes(r));

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["support-unread-count"],
    queryFn: () => getUnreadSupportCount(),
    enabled: isAuthorized,
    refetchInterval: 60000, // Atualiza a cada minuto
  });

  if (!isAuthorized) return null;

  const menuOptions = [
    {
      label: "Abrir chamado",
      icon: Plus,
      onClick: () => {
        openSupport({});
        setIsOpen(false);
      },
      description: "Nova solicitação técnica"
    },
    {
      label: "Meus chamados",
      icon: History,
      onClick: () => {
        navigate({ to: "/suporte" });
        setIsOpen(false);
      },
      description: "Acompanhe suas solicitações"
    },
    {
      label: "Base de Conhecimento",
      icon: FileText,
      onClick: () => {
        navigate({ to: "/suporte/conhecimento" });
        setIsOpen(false);
      },
      description: "Tutoriais e diagnósticos"
    }
  ];

  // Opção contextual se estiver em uma tela operacional
  const isOperationalRoute = ["/ausencias", "/retificacao", "/ocorrencias-ponto", "/processamento"].some(r => location.pathname.includes(r));
  
  if (isOperationalRoute) {
    menuOptions.unshift({
      label: "Reportar problema desta tela",
      icon: AlertCircle,
      onClick: () => {
        openSupport({
          sourceModule: "Atalho FAB Contextual",
        });
        setIsOpen(false);
      },
      description: "Capturar erro desta página"
    });
  }


  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          <button
            className={cn(
              "fixed bottom-6 right-6 z-[60] shadow-2xl rounded-full transition-all duration-300 hover:scale-105 active:scale-95 bg-[#006BA6] text-white h-12 w-12 flex items-center justify-center overflow-visible hover:ring-4 hover:ring-[#006BA6]/10 border-none cursor-pointer",
              unreadCount > 0 && "animate-pulse"
            )}
            aria-label="Suporte MK9"
          >
            <div className="relative pointer-events-none flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-black min-w-[18px] h-4.5 flex items-center justify-center rounded-full border-2 border-white shadow-lg z-10 px-1">
                  {unreadCount > 9 ? "+9" : unreadCount}
                </span>
              )}
            </div>
          </button>
        </DrawerTrigger>
        <DrawerContent className="p-4 pb-8">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-primary font-black uppercase tracking-tighter">
              <HelpCircle className="w-5 h-5" />
              Suporte MK9
            </DrawerTitle>
          </DrawerHeader>
          <div className="grid gap-2">
            {menuOptions.map((opt) => (
              <Button
                key={opt.label}
                variant="ghost"
                className="h-auto py-4 px-4 justify-start gap-4 hover:bg-slate-100 dark:hover:bg-slate-800 border"
                onClick={opt.onClick}
              >
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <opt.icon className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-bold">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                </div>
              </Button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "fixed bottom-6 right-6 z-[60] shadow-2xl rounded-full transition-all duration-300 hover:scale-105 active:scale-95 bg-[#006BA6] text-white h-12 px-4 flex items-center gap-2 overflow-visible hover:ring-4 hover:ring-[#006BA6]/10 border-none cursor-pointer",
            unreadCount > 0 && "animate-pulse"
          )}
          aria-label="Suporte MK9"
        >
          <div className="relative pointer-events-none flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-black min-w-[18px] h-4.5 flex items-center justify-center rounded-full border-2 border-white shadow-lg z-10 px-1">
                {unreadCount > 9 ? "+9" : unreadCount}
              </span>
            )}
            <span className="font-bold tracking-tight">Suporte</span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 shadow-2xl border-primary/20 z-[70]" align="end" sideOffset={16}>
        <div className="grid gap-1">
          <div className="px-3 py-2 border-b mb-1 flex items-center justify-between">
             <span className="text-[10px] font-black uppercase tracking-widest text-primary">Suporte Interno</span>
             <HelpCircle className="w-3 h-3 text-muted-foreground opacity-50" />
          </div>
          {menuOptions.map((opt) => (
            <Button
              key={opt.label}
              variant="ghost"
              className="w-full justify-start gap-3 h-10 px-3 hover:bg-primary/5 group"
              onClick={opt.onClick}
            >
              <opt.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs font-bold">{opt.label}</span>
                <span className="text-[8px] text-muted-foreground uppercase tracking-tighter">{opt.description}</span>
              </div>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
