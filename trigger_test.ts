import { processNotificationOutbox } from "./src/lib/health-worker.server";

async function run() {
  console.log("Starting Real P0 Notification Test (Exactly 1)...");
  try {
    const result = await processNotificationOutbox(false); // dryRun = false
    console.log("Worker finished:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Worker failed:", err);
    process.exit(1);
  }
}

run();
