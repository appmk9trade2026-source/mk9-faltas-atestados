import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { isPwaInstallHidden, resetPwaInstallPreference } from "@/components/pwa/pwa-install-prompt";
import { logPwaInstallEvent } from "@/lib/pwa-install.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes/preferencias")({
  head: () => ({ meta: [{ title: "Preferências · CRM MK9" }] }),
  component: PreferenciasPage,
});

function PreferenciasPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [showInstall, setShowInstall] = useState(true);

  useEffect(() => {
    setShowInstall(!isPwaInstallHidden(userId));
  }, [userId]);

  async function handleToggle(next: boolean) {
    setShowInstall(next);
    if (next) {
      resetPwaInstallPreference(userId);
      try {
        await logPwaInstallEvent({
          data: {
            acao: "PWA_INSTALL_PREF_RESET",
            navegador: navigator.userAgent,
            plataforma: navigator.platform,
          },
        });
      } catch {
        /* ignore */
      }
      toast.success("Convite de instalação reativado.");
    } else {
      // Just persist as hidden via same key.
      try {
        window.localStorage.setItem(
          `mk9.pwa.install.${userId ?? "anon"}`,
          JSON.stringify({ hidden: true }),
        );
      } catch {
        /* ignore */
      }
      toast.message("Convite de instalação ocultado.");
    }
  }

  return (
    <AppShell title="Preferências" breadcrumb={["Configurações", "Preferências"]}>
      <p className="text-sm text-muted-foreground -mt-4">
        Personalize a experiência do CRM MK9 para este usuário.
      </p>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle>Aplicativo instalável</CardTitle>
              <CardDescription>
                Exibir o convite para instalar o CRM MK9 no dispositivo em navegadores compatíveis.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="pwa-toggle" className="cursor-pointer">
              Mostrar convite para instalar o aplicativo
            </Label>
            <Switch id="pwa-toggle" checked={showInstall} onCheckedChange={handleToggle} />
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
