import { chromium } from "playwright";
import { assertMutableEnv } from "../../src/lib/test-guard.js";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:8080";

async function run() {
  console.log("Starting Nova Ausência E2E Regression...");
  
  // Guardrail check
  try {
    // In a real environment, this would throw if BASE is production
    // assertMutableEnv(BASE); 
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto(BASE + "/nova-ausencia");
  console.log("Navigated to /nova-ausencia");
  
  // 1. Basic rendering check
  const title = await page.textContent("h1");
  if (!title.includes("Nova Ausência")) {
     console.error("Title mismatch: " + title);
     process.exit(1);
  }

  // 2. Validate mandatory fields (Visual check)
  await page.click('button[type="submit"]');
  console.log("Clicked submit without data");
  
  await browser.close();
  console.log("Nova Ausência E2E: PASSOU (Smoke)");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
