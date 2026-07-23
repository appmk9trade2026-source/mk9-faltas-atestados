import { Link, useRouterState } from "@tanstack/react-router";
import { Gauge, ShieldCheck, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sub-navegação compartilhada entre os três painéis do módulo de Inteligência:
 *  • Dashboard Executivo — visão estratégica.
 *  • Governança         — acompanhamento operacional (alertas, SLA, auditoria).
 *  • Qualidade dos Dados — integridade, vínculos, importação e reconciliação.
 *
 * A separação de escopo é UX: RLS/RBAC/RPCs permanecem inalterados.
 */
type NavItem = {
  to: "/inteligencia/dashboard" | "/inteligencia/governanca" | "/inteligencia/qualidade";
  label: string;
  icon: typeof Gauge;
  tone: "exec" | "gov" | "qual";
  hint: string;
};

const ITEMS: NavItem[] = [
  {
    to: "/inteligencia/dashboard",
    label: "Dashboard Executivo",
    icon: Gauge,
    tone: "exec",
    hint: "Visão estratégica",
  },
  {
    to: "/inteligencia/governanca",
    label: "Governança",
    icon: ShieldCheck,
    tone: "gov",
    hint: "Acompanhamento operacional",
  },
  {
    to: "/inteligencia/qualidade",
    label: "Qualidade dos Dados",
    icon: ClipboardCheck,
    tone: "qual",
    hint: "Integridade das informações",
  },
];

const TONE: Record<NavItem["tone"], { active: string; idle: string }> = {
  exec: {
    active: "bg-primary/10 text-primary border-primary/40",
    idle: "border-transparent text-muted-foreground hover:text-foreground hover:border-primary/20",
  },
  gov: {
    active: "bg-primary/10 text-primary border-primary/40",
    idle: "border-transparent text-muted-foreground hover:text-foreground hover:border-primary/20",
  },
  qual: {
    active: "bg-primary/10 text-primary border-primary/40",
    idle: "border-transparent text-muted-foreground hover:text-foreground hover:border-primary/20",
  },
};

export function IntelligenceNav({ current }: { current: NavItem["to"] }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav
      aria-label="Navegação do módulo de Inteligência"
      className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1"
    >
      {ITEMS.map((it) => {
        const isActive = current === it.to || pathname === it.to;
        const tone = TONE[it.tone];
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? tone.active : tone.idle,
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function IntelligenceHeader({
  current,
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  current: NavItem["to"];
  title: string;
  subtitle: string;
  icon: typeof Gauge;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <IntelligenceNav current={current} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
