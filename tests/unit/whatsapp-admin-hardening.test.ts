import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canAccessWhatsappAdmin,
  WHATSAPP_ADMIN_ROLES,
} from "@/lib/whatsapp-admin-access";
import type { AppRole } from "@/hooks/use-session";

const ROUTES_DIR = path.resolve(__dirname, "../../src/routes/_authenticated");
const WHATSAPP_ROUTE_FILES = [
  "comunicacoes.whatsapp.tsx",
  "comunicacoes.whatsapp.index.tsx",
  "comunicacoes.whatsapp.outbox.tsx",
  "comunicacoes.whatsapp.dead-letter.tsx",
  "comunicacoes.whatsapp.execucoes.tsx",
  "comunicacoes.whatsapp.health.tsx",
  "comunicacoes.whatsapp.configuracao.tsx",
];

function readRoute(file: string) {
  return fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
}

function stripComments(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("whatsapp admin — access helper", () => {
  it("permite super_admin, compliance e rh", () => {
    expect(canAccessWhatsappAdmin(["super_admin"])).toBe(true);
    expect(canAccessWhatsappAdmin(["compliance"])).toBe(true);
    expect(canAccessWhatsappAdmin(["rh"])).toBe(true);
  });

  it("nega demais papéis e casos vazios/nulos", () => {
    const denied: AppRole[][] = [["supervisor"], ["operacao"], ["visualizador"], []];
    for (const r of denied) expect(canAccessWhatsappAdmin(r)).toBe(false);
    expect(canAccessWhatsappAdmin(null)).toBe(false);
    expect(canAccessWhatsappAdmin(undefined)).toBe(false);
  });

  it("mantém a lista canônica de papéis autorizados", () => {
    expect([...WHATSAPP_ADMIN_ROLES].sort()).toEqual(
      ["compliance", "rh", "super_admin"].sort(),
    );
  });
});

describe("whatsapp admin — hardening das rotas", () => {
  it.each(WHATSAPP_ROUTE_FILES)("nenhuma rota redireciona para si mesma (%s)", (file) => {
    const src = stripComments(readRoute(file));
    expect(src).not.toMatch(/redirect\s*\(\s*\{[^}]*to:\s*["']\/comunicacoes\/whatsapp/);
    expect(src).not.toMatch(/window\.location/);
  });

  it.each(WHATSAPP_ROUTE_FILES)("não possui redirect, Navigate ou fallback para o Dashboard principal (%s)", (file) => {
    const src = stripComments(readRoute(file));
    expect(src).not.toMatch(/redirect\s*\(/);
    expect(src).not.toMatch(/<Navigate\b/);
    expect(src).not.toMatch(/navigate\s*\(\s*\{[^}]*to:\s*["']\/(dashboard|home|)["']/);
    expect(src).not.toMatch(/to=\{?["']\/(dashboard|home)["']/);
  });

  it("boundaries do WhatsApp Admin não apontam para o Dashboard principal", () => {
    const src = stripComments(
      fs.readFileSync(path.resolve(__dirname, "../../src/components/whatsapp/route-boundaries.tsx"), "utf8"),
    );
    expect(src).not.toMatch(/redirect\s*\(/);
    expect(src).not.toMatch(/<Navigate\b/);
    expect(src).not.toMatch(/to=\{?["']\/(dashboard|home)["']/);
  });

  it.each(WHATSAPP_ROUTE_FILES)("possui errorComponent e notFoundComponent (%s)", (file) => {
    const src = readRoute(file);
    expect(src).toMatch(/errorComponent\s*:/);
    expect(src).toMatch(/notFoundComponent\s*:/);
  });

  it("layout renderiza <Outlet /> e usa canAccessWhatsappAdmin", () => {
    const src = readRoute("comunicacoes.whatsapp.tsx");
    expect(src).toMatch(/<Outlet\s*\/>/);
    expect(src).toMatch(/canAccessWhatsappAdmin/);
  });

  it("sidebar consome a lista canônica de papéis", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf8",
    );
    expect(src).toMatch(/WHATSAPP_ADMIN_ROLES/);
    // Item da sidebar aponta para a rota correta.
    expect(src).toMatch(/\/comunicacoes\/whatsapp/);
    // Evita tela antiga sob a URL nova durante o carregamento do chunk da rota.
    expect(src).toMatch(/router\.preloadRoute\(\{ to: "\/comunicacoes\/whatsapp" \}\)/);
    expect(src).toMatch(/router\.navigate\(\{ to: "\/comunicacoes\/whatsapp" \}\)/);
  });
});
