import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { NovoChamadoDialog } from "./novo-chamado-dialog";
import { useLocation } from "@tanstack/react-router";
import { SupportFAB } from "./support-fab";

export interface SupportContextData {
  sourceRoute: string;
  sourceModule: string;
  entityType?: string;
  entityId?: string;
  protocol?: string;
  safeCode?: string;
  suggestedCategory?: string;
}

interface SupportContextType {
  openSupport: (context: Partial<SupportContextData>) => void;
}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

export function SupportProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<Partial<SupportContextData>>({});
  const location = useLocation();

  const openSupport = useCallback((ctx: Partial<SupportContextData>) => {
    setContext({
      sourceRoute: location.pathname,
      ...ctx,
    });
    setIsOpen(true);
  }, [location.pathname]);

  return (
    <SupportContext.Provider value={{ openSupport }}>
      {children}
      <SupportFAB />
      <NovoChamadoDialog 
        open={isOpen} 
        onOpenChange={setIsOpen} 
        context={context} 
      />
    </SupportContext.Provider>
  );
}

export function useSupport() {
  const context = useContext(SupportContext);
  if (!context) {
    throw new Error("useSupport must be used within a SupportProvider");
  }
  return context;
}
