import { checkEvolutionNumber } from "./src/lib/evolution-api.server";

async function main() {
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  if (!baseUrl || !apiKey || !instanceName) {
    console.error("Missing Evolution secrets");
    process.exit(1);
  }

  const testNumber = "5511942004200"; 
  console.log(`--- PROVIDER CHECK: ${testNumber} ---`);

  const result = await checkEvolutionNumber({
    baseUrl,
    apiKey,
    instance: instanceName,
    telefone: testNumber,
    timeoutMs: 10000
  });

  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
