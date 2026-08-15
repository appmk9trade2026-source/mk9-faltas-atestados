import { processNotificationOutbox } from './src/lib/health-worker.server';

async function run() {
  console.log("--- EXECUÇÃO REAL TR-8-REAL-002 ---");
  const result = await processNotificationOutbox(false);
  console.log(JSON.stringify(result, null, 2));
}
run().catch(err => {
  console.error(err);
  process.exit(1);
});
