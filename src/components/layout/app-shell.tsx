import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
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
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession, type AppRole } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/layout/notification-bell";
import { CommandPaletteProvider } from "@/components/command-palette/command-palette";
import { CommandPaletteButton } from "@/components/command-palette/search-button";
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

  async function handleLogout() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/auth", replace: true });
  }

  const nome = profile?.nome ?? "Usuário";
  const email = profile?.email ?? "";
  const displayBreadcrumb = breadcrumb ?? [title];

  return (
    <SidebarProvider>
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
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
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
      </SidebarInset>
    </SidebarProvider>
  );
}
