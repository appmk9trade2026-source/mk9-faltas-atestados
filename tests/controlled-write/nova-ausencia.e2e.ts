import { chromium } from "playwright";
import { assertMutableEnv } from "../../src/lib/test-guard";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:8080";

async function run() {
  console.log("Starting Nova Ausência E2E Regression...");
  
  // Guardrail check
  try {
    assertMutableEnv(BASE); 
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to /auth first to avoid redirect loops if not authenticated
  // But for simple smoke, we go straight to the target
  await page.goto(BASE + "/nova-ausencia");
  console.log("Navigated to /nova-ausencia");
  
  // Wait for content
  await page.waitForLoadState('networkidle');

  // 1. Basic rendering check
  const content = await page.content();
  if (content.includes("404") || content.includes("não encontrada")) {
     console.error("Page not found or error loading");
     process.exit(1);
  }

  console.log("Nova Ausência E2E: PASSOU (Smoke)");
  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
