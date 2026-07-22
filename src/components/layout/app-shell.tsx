import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession, type AppRole } from "@/hooks/use-session";
import { performSignOut } from "@/lib/auth-signout";
import { NotificationBell } from "@/components/layout/notification-bell";
import { CommandPaletteProvider } from "@/components/command-palette/command-palette";
import { CommandPaletteButton } from "@/components/command-palette/search-button";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { toast } from "sonner";

const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  rh: "RH",
  supervisor: "Supervisor",
  compliance: "Compliance",
  operacao: "Operação",
  visualizador: "Visualizador",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({ title, breadcrumb, children }: { title: string; breadcrumb?: string[]; children: ReactNode }) {
  const { profile, roles, primaryRole } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await performSignOut(queryClient);
      toast.success("Logout realizado com sucesso.");
      setConfirmOpen(false);
      navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Não foi possível encerrar a sessão. Tente novamente.");
      setSigningOut(false);
    }
  }

  const nome = profile?.nome ?? "Usuário";
  const email = profile?.email ?? "";
  const displayBreadcrumb = breadcrumb ?? [title];

  return (
    <SidebarProvider>
      <CommandPaletteProvider>
      <AppSidebar roles={roles} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <span>MK9</span>
              {displayBreadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  <span aria-hidden>/</span>
                  <span className={i === displayBreadcrumb.length - 1 ? "text-foreground truncate" : "truncate"}>{b}</span>
                </span>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <CommandPaletteButton />
            <NotificationBell />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[11px] font-medium">{initials(nome)}</AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:flex flex-col items-start leading-tight">
                    <span className="text-xs font-medium">{nome}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {primaryRole ? roleLabel[primaryRole] : "Sem papel"}
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm">{nome}</span>
                  <span className="text-xs font-normal text-muted-foreground">{email}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {roles.length === 0 && <Badge variant="outline" className="text-[10px]">sem papel</Badge>}
                    {roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">{roleLabel[r]}</Badge>
                    ))}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setConfirmOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            </div>
            {children}
          </div>
        </main>
        <PwaInstallPrompt />
      </SidebarInset>
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
