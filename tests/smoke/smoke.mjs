/**
 * SMOKE TEST — CRM MK9
 *
 * Read-only Playwright script. Runs against any environment, including
 * production, because it only navigates and asserts non-404 responses.
 *
 * Usage:
 *   TEST_BASE_URL=http://localhost:8080 node tests/smoke/smoke.mjs
 *
 * When credentials are provided via TEST_USER_EMAIL / TEST_USER_PASSWORD the
 * script will sign in and probe authenticated routes; otherwise it stops at
 * /auth. It NEVER creates or mutates records.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:8080";
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

const PUBLIC_ROUTES = ["/", "/auth"];
const AUTH_ROUTES = [
  "/dashboard",
  "/colaboradores",
  "/colaboradores/importar",
  "/colaboradores/importacoes",
  "/ausencias",
  "/comunicacoes",
  "/painel-rh",
  "/relatorios",
  "/auditoria",
  "/configuracoes",
  "/saude",
  "/documentacao",
  "/homologacao",
];

const OUT = resolve("test-results/smoke");
mkdirSync(OUT, { recursive: true });

const results = [];

async function probe(page, path) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  const ok = !!resp && resp.status() < 400;
  const body = await page.content();
  const isNotFound = /404|não encontrada|not found/i.test(body) && !/Nenhum|vazio/i.test(body);
  const passed = ok && !isNotFound;
  results.push({ path, status: resp?.status() ?? 0, ok: passed, ms: Date.now() - started });
  await page.screenshot({ path: resolve(OUT, `${path.replace(/[/]/g, "_") || "root"}.png`) });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// Redact credentials from logs
page.on("console", (msg) => {
  if (/access_token|refresh_token|password/i.test(msg.text())) return;
});

for (const p of PUBLIC_ROUTES) await probe(page, p);

if (EMAIL && PASSWORD) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20_000 }).catch(() => {});
  for (const p of AUTH_ROUTES) await probe(page, p);
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.table(results);
console.log(`Smoke: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.error("FAILED:", failed);
  process.exit(1);
}
