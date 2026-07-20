import { useEffect, useRef, useState } from "react";
import { Download, Smartphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSession } from "@/hooks/use-session";
import { logPwaInstallEvent } from "@/lib/pwa-install.functions";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Pref = {
  hidden?: boolean;         // "não mostrar novamente"
  remindAfter?: number;     // epoch ms
  installed?: boolean;
};

function storageKey(userId: string | null | undefined) {
  return `mk9.pwa.install.${userId ?? "anon"}`;
}

function readPref(userId: string | null | undefined): Pref {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Pref) : {};
  } catch {
    return {};
  }
}

function writePref(userId: string | null | undefined, pref: Pref) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(pref));
  } catch {
    /* ignore */
  }
}

export function resetPwaInstallPreference(userId: string | null | undefined) {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

export function isPwaInstallHidden(userId: string | null | undefined): boolean {
  return !!readPref(userId).hidden;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari legacy
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!mm || iosStandalone;
}

function browserInfo() {
  if (typeof navigator === "undefined") return { navegador: "", plataforma: "" };
  const ua = navigator.userAgent || "";
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "";
  return { navegador: ua, plataforma: platform };
}

async function safeLog(acao: Parameters<typeof logPwaInstallEvent>[0]["data"]["acao"]) {
  try {
    const info = browserInfo();
    await logPwaInstallEvent({ data: { acao, ...info } });
  } catch {
    /* auditoria best-effort */
  }
}

export function PwaInstallPrompt() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) {
      writePref(userId, { ...readPref(userId), installed: true });
      return;
    }

    const pref = readPref(userId);
    if (pref.hidden) return;
    if (pref.remindAfter && Date.now() < pref.remindAfter) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setSupported(true);
      if (!shownRef.current) {
        shownRef.current = true;
        setOpen(true);
        void safeLog("PWA_INSTALL_PROMPT_SHOWN");
      }
    };

    const onInstalled = () => {
      writePref(userId, { ...readPref(userId), installed: true });
      setOpen(false);
      void safeLog("PWA_INSTALL_ACCEPTED");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [userId]);

  async function handleInstall() {
    const evt = deferredRef.current;
    if (!evt) return;
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === "accepted") {
        toast.success("CRM MK9 instalado com sucesso.");
        void safeLog("PWA_INSTALL_ACCEPTED");
        writePref(userId, { ...readPref(userId), installed: true, hidden: true });
      } else {
        void safeLog("PWA_INSTALL_DISMISSED");
      }
    } catch {
      /* ignore */
    } finally {
      deferredRef.current = null;
      setOpen(false);
    }
  }

  function handleRemindLater() {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    writePref(userId, { ...readPref(userId), remindAfter: Date.now() + sevenDays });
    void safeLog("PWA_INSTALL_REMIND_LATER");
    setOpen(false);
  }

  function handleNever() {
    writePref(userId, { ...readPref(userId), hidden: true });
    void safeLog("PWA_INSTALL_NEVER");
    setOpen(false);
  }

  if (!supported || !open) return null;

  const title = "Instale o CRM MK9";
  const description =
    "Instale o CRM MK9 para acessar mais rapidamente, receber uma experiência semelhante a um aplicativo e utilizar recursos otimizados.";

  const Illustration = (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30 shrink-0">
      <Smartphone className="h-7 w-7" />
    </div>
  );

  const Actions = (
    <>
      <Button onClick={handleInstall} className="gap-2">
        <Download className="h-4 w-4" />
        Instalar agora
      </Button>
      <Button variant="outline" onClick={handleRemindLater}>
        Lembrar mais tarde
      </Button>
      <Button variant="ghost" onClick={handleNever} className="text-muted-foreground">
        Não mostrar novamente
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl border-t">
          <SheetHeader className="text-left">
            <div className="flex items-start gap-3">
              {Illustration}
              <div className="flex-1">
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> {title}
                </SheetTitle>
                <SheetDescription className="mt-1">{description}</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">{Actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {Illustration}
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> {title}
              </DialogTitle>
              <DialogDescription className="mt-1">{description}</DialogDescription>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-col">{Actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
