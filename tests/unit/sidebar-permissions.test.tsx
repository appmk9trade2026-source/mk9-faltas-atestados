import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/app-sidebar";
import type { AppRole } from "@/hooks/use-session";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * ETAPA 2 — PERMISSÕES POR PERFIL
 *
 * Validates that role-based menu filtering never leaks admin surfaces to
 * lower-privilege roles. This is a defence-in-depth check on top of RLS.
 */

function renderSidebar(roles: AppRole[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider>
        <AppSidebar roles={roles} />
        <Outlet />
      </SidebarProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // @ts-expect-error test-only router
  return render(<RouterProvider router={router} />);
}

const EXPECTED: Record<AppRole, { visible: string[]; hidden: string[] }> = {
  super_admin: {
    visible: ["Dashboard", "Configurações", "Auditoria", "Usuários", "Homologação", "Saúde do Sistema", "Documentação"],
    hidden: [],
  },
  rh: {
    visible: ["Dashboard", "Painel do RH", "Colaboradores", "Importações", "Configurações", "Auditoria", "Homologação"],
    hidden: ["Usuários", "Saúde do Sistema", "Documentação"],
  },
  compliance: {
    visible: ["Dashboard", "Auditoria", "Relatórios", "Homologação", "Colaboradores"],
    hidden: ["Configurações", "Usuários", "Nova Ausência", "Painel do RH", "Saúde do Sistema", "Documentação"],
  },
  supervisor: {
    visible: ["Dashboard", "Nova Ausência", "Ausências", "Colaboradores"],
    hidden: ["Configurações", "Auditoria", "Usuários", "Homologação", "Painel do RH", "Saúde do Sistema", "Documentação"],
  },
};

describe.each(Object.entries(EXPECTED))("sidebar for role: %s", (role, spec) => {
  it("shows every allowed item and hides every forbidden item", () => {
    renderSidebar([role as AppRole]);
    for (const label of spec.visible) {
      expect(screen.queryAllByText(label).length, `expected "${label}" visible for ${role}`).toBeGreaterThan(0);
    }
    for (const label of spec.hidden) {
      expect(screen.queryByText(label), `expected "${label}" hidden for ${role}`).toBeNull();
    }
  });
});
