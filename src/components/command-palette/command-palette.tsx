import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  History,
  Users,
  Bell,
  BarChart3,
  Settings,
  UserCog,
  MessageSquare,
  ScrollText,
  Activity,
  HardDrive,
  BookOpen,
  ClipboardCheck,
  Rocket,
  BellRing,
  Map as MapIcon,
  KeyRound,
  Sparkles,
  Gauge,
  Building2,
  Briefcase,
  UserPlus,
  FolderPlus,
  Star,
  StarOff,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useSession, type AppRole } from "@/hooks/use-session";
import { WHATSAPP_ADMIN_ROLES } from "@/lib/whatsapp-admin-access";

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────

type Ctx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
const CommandPaletteCtx = React.createContext<Ctx | null>(null);

export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteCtx);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return (
    <CommandPaletteCtx.Provider value={value}>
      {children}
      <CommandPalette />
    </CommandPaletteCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Static registry (rotas + ações)
// ─────────────────────────────────────────────────────────────

type NavItem = {
  id: string;
  title: string;
  description?: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  keywords?: string;
};

const PAGES: NavItem[] = [
  { id: "p:dashboard", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { id: "p:nova-ausencia", title: "Nova Ausência", url: "/nova-ausencia", icon: FilePlus2, roles: ["super_admin", "rh", "supervisor"] },
  { id: "p:ausencias", title: "Ausências", url: "/ausencias", icon: History, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { id: "p:painel-rh", title: "Painel do RH", url: "/painel-rh", icon: ClipboardList, roles: ["super_admin", "rh"] },
  { id: "p:historico", title: "Histórico", url: "/historico", icon: History, roles: ["super_admin", "rh", "supervisor"] },
  { id: "p:colaboradores", title: "Colaboradores", url: "/colaboradores", icon: Users, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { id: "p:importacoes", title: "Importações", url: "/colaboradores/importacoes", icon: History, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { id: "p:comunicacoes", title: "Comunicações", url: "/comunicacoes", icon: MessageSquare, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { id: "p:whatsapp", title: "WhatsApp Admin", url: "/comunicacoes/whatsapp", icon: MessageSquare, roles: WHATSAPP_ADMIN_ROLES },
  { id: "p:alertas", title: "Alertas", url: "/alertas", icon: Bell, roles: ["super_admin", "rh", "compliance"] },
  { id: "p:relatorios", title: "Relatórios", url: "/relatorios", icon: BarChart3, roles: ["super_admin", "rh", "compliance"] },
  { id: "p:configuracoes", title: "Configurações", url: "/configuracoes", icon: Settings, roles: ["super_admin", "rh"] },
  { id: "p:empresas", title: "Empresas", description: "Configurações", url: "/configuracoes/empresas", icon: Building2, roles: ["super_admin", "rh"] },
  { id: "p:projetos", title: "Projetos", description: "Configurações", url: "/configuracoes/projetos", icon: Briefcase, roles: ["super_admin", "rh"] },
  { id: "p:auditoria", title: "Auditoria", url: "/auditoria", icon: ScrollText, roles: ["super_admin", "compliance", "rh"] },
  { id: "p:usuarios", title: "Usuários", url: "/usuarios", icon: UserCog, roles: ["super_admin", "compliance", "rh"] },
  { id: "p:homologacao", title: "Homologação", url: "/homologacao", icon: ClipboardCheck, roles: ["super_admin", "compliance", "rh"] },
  { id: "p:saude", title: "Saúde do Sistema", url: "/saude", icon: Activity, roles: ["super_admin"] },
  { id: "p:operacoes", title: "Operações", url: "/operacoes", icon: HardDrive, roles: ["super_admin", "compliance"] },
  { id: "p:documentacao", title: "Documentação", url: "/documentacao", icon: BookOpen, roles: ["super_admin"] },
  { id: "p:deploy", title: "Deploy & Go-Live", url: "/deploy", icon: Rocket, roles: ["super_admin", "compliance"] },
  { id: "p:operacao-assistida", title: "Operação Assistida", url: "/operacao-assistida", icon: ClipboardCheck, roles: ["super_admin", "compliance", "rh"] },
  { id: "p:notificacoes", title: "Notificações", url: "/notificacoes", icon: BellRing, roles: ["super_admin", "compliance", "rh"] },
  { id: "p:roadmap", title: "Roadmap", url: "/roadmap", icon: MapIcon, roles: ["super_admin", "compliance"] },
  { id: "p:acessos", title: "Acessos", url: "/acessos", icon: KeyRound, roles: ["super_admin", "compliance"] },
  { id: "p:bi", title: "BI Executivo", url: "/bi-executivo", icon: Sparkles, roles: ["super_admin", "compliance", "rh"] },
  { id: "p:observabilidade", title: "Observabilidade", url: "/observabilidade", icon: Gauge, roles: ["super_admin", "compliance"] },
];

const ACTIONS: NavItem[] = [
  { id: "a:nova-ausencia", title: "Nova Ausência", description: "Registrar uma nova ausência", url: "/nova-ausencia", icon: FilePlus2, roles: ["super_admin", "rh", "supervisor"], keywords: "criar atestado falta" },
  { id: "a:novo-colaborador", title: "Novo Colaborador", description: "Cadastrar colaborador", url: "/colaboradores?novo=1", icon: UserPlus, roles: ["super_admin", "rh"], keywords: "criar cadastrar" },
  { id: "a:novo-usuario", title: "Novo Usuário", description: "Criar acesso ao sistema", url: "/usuarios?novo=1", icon: UserPlus, roles: ["super_admin", "compliance", "rh"], keywords: "criar convidar acesso" },
  { id: "a:novo-projeto", title: "Novo Projeto", description: "Criar projeto", url: "/configuracoes/projetos?novo=1", icon: FolderPlus, roles: ["super_admin", "rh"], keywords: "criar" },
  { id: "a:nova-empresa", title: "Nova Empresa", description: "Cadastrar empresa", url: "/configuracoes/empresas?novo=1", icon: Building2, roles: ["super_admin", "rh"], keywords: "criar" },
  { id: "a:novo-relatorio", title: "Gerar Relatório", description: "Abrir central de relatórios", url: "/relatorios", icon: BarChart3, roles: ["super_admin", "rh", "compliance"], keywords: "exportar" },
];

// ─────────────────────────────────────────────────────────────
// Recentes / Favoritos (localStorage)
// ─────────────────────────────────────────────────────────────

const RECENT_KEY = "mk9.palette.recents.v1";
const FAV_KEY = "mk9.palette.favs.v1";
const MAX_RECENT = 8;

type RecentEntry = { id: string; title: string; description?: string; url: string; iconKey: string; ts: number };

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  page: ArrowRight,
  action: Sparkles,
  colaborador: Users,
  projeto: Briefcase,
  empresa: Building2,
  usuario: UserCog,
};

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

// ─────────────────────────────────────────────────────────────
// Async entity search
// ─────────────────────────────────────────────────────────────

type EntityHit = {
  id: string;
  title: string;
  description?: string;
  url: string;
  iconKey: keyof typeof ICON_MAP;
  group: "PESSOAS" | "PROJETOS" | "EMPRESAS" | "USUÁRIOS";
};

function useDebouncedValue<T>(value: T, ms: number) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

async function searchEntities(query: string, roles: AppRole[]): Promise<EntityHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const canUsers = roles.some((r) => r === "super_admin" || r === "compliance" || r === "rh");
  const canColabs = roles.some((r) => r === "super_admin" || r === "rh" || r === "supervisor" || r === "compliance");
  const canConfig = roles.some((r) => r === "super_admin" || r === "rh");

  const [colabRes, projRes, empRes, usrRes] = await Promise.all([
    canColabs
      ? supabase.from("colaboradores").select("id, nome, matricula").ilike("nome", like).eq("ativo", true).limit(6)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    canConfig
      ? supabase.from("projetos").select("id, nome, codigo").ilike("nome", like).limit(6)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    canConfig
      ? supabase.from("empresas").select("id, nome").ilike("nome", like).limit(4)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    canUsers
      ? supabase.from("profiles").select("id, nome, email").ilike("nome", like).limit(6)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
  ]);

  const hits: EntityHit[] = [];
  for (const r of (colabRes.data ?? []) as Array<{ id: string; nome: string; matricula?: string | null }>) {
    hits.push({
      id: `colab:${r.id}`,
      title: r.nome,
      description: r.matricula ? `Matrícula ${r.matricula}` : "Colaborador",
      url: `/colaboradores?q=${encodeURIComponent(r.nome)}`,
      iconKey: "colaborador",
      group: "PESSOAS",
    });
  }
  for (const r of (projRes.data ?? []) as Array<{ id: string; nome: string; codigo?: string | null }>) {
    hits.push({
      id: `proj:${r.id}`,
      title: r.nome,
      description: r.codigo ? `Código ${r.codigo}` : "Projeto",
      url: `/configuracoes/projetos?q=${encodeURIComponent(r.nome)}`,
      iconKey: "projeto",
      group: "PROJETOS",
    });
  }
  for (const r of (empRes.data ?? []) as Array<{ id: string; nome: string }>) {
    hits.push({
      id: `emp:${r.id}`,
      title: r.nome,
      description: "Empresa",
      url: `/configuracoes/empresas?q=${encodeURIComponent(r.nome)}`,
      iconKey: "empresa",
      group: "EMPRESAS",
    });
  }
  for (const r of (usrRes.data ?? []) as Array<{ id: string; nome: string; email: string }>) {
    hits.push({
      id: `usr:${r.id}`,
      title: r.nome,
      description: r.email,
      url: `/usuarios?q=${encodeURIComponent(r.nome)}`,
      iconKey: "usuario",
      group: "USUÁRIOS",
    });
  }
  return hits;
}

// ─────────────────────────────────────────────────────────────
// Palette component
// ─────────────────────────────────────────────────────────────

function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const { roles } = useSession();
  const [query, setQuery] = React.useState("");
  const debounced = useDebouncedValue(query, 200);
  const [entities, setEntities] = React.useState<EntityHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [recents, setRecents] = React.useState<RecentEntry[]>(() => readLS<RecentEntry[]>(RECENT_KEY, []));
  const [favs, setFavs] = React.useState<string[]>(() => readLS<string[]>(FAV_KEY, []));

  // reset on close
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setEntities([]);
    }
  }, [open]);

  // async search
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (debounced.trim().length < 2) {
      setEntities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    searchEntities(debounced, roles)
      .then((h) => {
        if (!cancelled) setEntities(h);
      })
      .catch(() => {
        if (!cancelled) setEntities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, roles]);

  const visiblePages = React.useMemo(
    () => PAGES.filter((p) => p.roles.some((r) => roles.includes(r))),
    [roles],
  );
  const visibleActions = React.useMemo(
    () => ACTIONS.filter((p) => p.roles.some((r) => roles.includes(r))),
    [roles],
  );

  const isFav = React.useCallback((id: string) => favs.includes(id), [favs]);
  const toggleFav = React.useCallback((id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeLS(FAV_KEY, next);
      return next;
    });
  }, []);

  const runNav = React.useCallback(
    (entry: { id: string; title: string; description?: string; url: string; iconKey: string }) => {
      const rec: RecentEntry = { ...entry, ts: Date.now() };
      setRecents((prev) => {
        const next = [rec, ...prev.filter((r) => r.id !== rec.id)].slice(0, MAX_RECENT);
        writeLS(RECENT_KEY, next);
        return next;
      });
      setOpen(false);
      // Split url + search
      const [path, search] = entry.url.split("?");
      const searchObj: Record<string, string> = {};
      if (search) {
        for (const pair of search.split("&")) {
          const [k, v] = pair.split("=");
          if (k) searchObj[k] = decodeURIComponent(v ?? "");
        }
      }
      navigate({ to: path, search: searchObj as never }).catch(() => {
        window.location.href = entry.url;
      });
    },
    [navigate, setOpen],
  );

  // Favoritos primeiro: coleta de páginas/ações favoritadas
  const favEntries = React.useMemo(() => {
    const all = [...visiblePages, ...visibleActions];
    return favs
      .map((id) => all.find((x) => x.id === id))
      .filter((x): x is NavItem => Boolean(x));
  }, [favs, visiblePages, visibleActions]);

  const hasQuery = query.trim().length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      // biome-ignore lint: aria label via title in dialog
    >
      <CommandInput
        placeholder="O que você deseja fazer?"
        value={query}
        onValueChange={setQuery}
        aria-label="Buscar no CRM"
      />
      <CommandList aria-live="polite">
        <CommandEmpty>
          {loading ? "Buscando…" : "Nenhum resultado encontrado."}
        </CommandEmpty>

        {!hasQuery && favEntries.length > 0 && (
          <CommandGroup heading="FAVORITOS">
            {favEntries.map((item) => (
              <PaletteRow
                key={`fav:${item.id}`}
                icon={item.icon}
                title={item.title}
                description={item.description}
                favorited
                onSelect={() =>
                  runNav({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    url: item.url,
                    iconKey: item.id.startsWith("a:") ? "action" : "page",
                  })
                }
                onToggleFav={() => toggleFav(item.id)}
              />
            ))}
          </CommandGroup>
        )}

        {!hasQuery && recents.length > 0 && (
          <CommandGroup heading="RECENTES">
            {recents.map((r) => {
              const Icon = ICON_MAP[r.iconKey] ?? ArrowRight;
              return (
                <PaletteRow
                  key={`rec:${r.id}`}
                  icon={Icon}
                  title={r.title}
                  description={r.description}
                  leading={<Clock className="h-4 w-4 text-muted-foreground" />}
                  onSelect={() => runNav(r)}
                />
              );
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        {visibleActions.length > 0 && (
          <CommandGroup heading="AÇÕES">
            {visibleActions.map((item) => (
              <PaletteRow
                key={item.id}
                icon={item.icon}
                title={item.title}
                description={item.description}
                keywords={item.keywords}
                favorited={isFav(item.id)}
                onSelect={() =>
                  runNav({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    url: item.url,
                    iconKey: "action",
                  })
                }
                onToggleFav={() => toggleFav(item.id)}
              />
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="PÁGINAS">
          {visiblePages.map((item) => (
            <PaletteRow
              key={item.id}
              icon={item.icon}
              title={item.title}
              description={item.description}
              favorited={isFav(item.id)}
              onSelect={() =>
                runNav({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  url: item.url,
                  iconKey: "page",
                })
              }
              onToggleFav={() => toggleFav(item.id)}
            />
          ))}
        </CommandGroup>

        {entities.length > 0 && <CommandSeparator />}

        {(["PESSOAS", "PROJETOS", "EMPRESAS", "USUÁRIOS"] as const).map((g) => {
          const rows = entities.filter((e) => e.group === g);
          if (rows.length === 0) return null;
          return (
            <CommandGroup key={g} heading={g}>
              {rows.map((h) => {
                const Icon = ICON_MAP[h.iconKey];
                return (
                  <PaletteRow
                    key={h.id}
                    icon={Icon}
                    title={h.title}
                    description={h.description}
                    onSelect={() =>
                      runNav({
                        id: h.id,
                        title: h.title,
                        description: h.description,
                        url: h.url,
                        iconKey: h.iconKey,
                      })
                    }
                  />
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>

      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">↵</kbd> abrir
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">esc</kbd> fechar
          </span>
        </div>
        <span>{loading ? "buscando…" : `${visiblePages.length + visibleActions.length + entities.length} resultados`}</span>
      </div>
    </CommandDialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────

function PaletteRow({
  icon: Icon,
  title,
  description,
  keywords,
  favorited,
  leading,
  onSelect,
  onToggleFav,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  keywords?: string;
  favorited?: boolean;
  leading?: React.ReactNode;
  onSelect: () => void;
  onToggleFav?: () => void;
}) {
  return (
    <CommandItem
      value={`${title} ${description ?? ""} ${keywords ?? ""}`}
      onSelect={onSelect}
      className="group/palette-row gap-2"
    >
      {leading ?? <Icon className="h-4 w-4 text-muted-foreground" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{title}</span>
        {description && (
          <span className="truncate text-[11px] text-muted-foreground">{description}</span>
        )}
      </div>
      {onToggleFav && (
        <button
          type="button"
          aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          className="ml-auto opacity-0 transition-opacity group-hover/palette-row:opacity-100 data-[fav=true]:opacity-100"
          data-fav={favorited ? "true" : "false"}
        >
          {favorited ? (
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          ) : (
            <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      )}
    </CommandItem>
  );
}
