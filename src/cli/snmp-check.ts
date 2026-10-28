import { readPrinterIdentity, type SnmpConnection } from "../modules/printers/snmp/client";

function readInteger(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} deve ser um número inteiro maior ou igual a ${minimum}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const connection: SnmpConnection = {
    host: process.env.SNMP_HOST?.trim() ?? "",
    port: readInteger("SNMP_PORT", 161, 1),
    community: process.env.SNMP_COMMUNITY ?? "",
    timeoutMs: readInteger("SNMP_TIMEOUT_MS", 2000, 1),
    retries: readInteger("SNMP_RETRIES", 1, 0),
  };

  if (!connection.host || !connection.community) {
    throw new Error("Defina SNMP_HOST e SNMP_COMMUNITY no arquivo .env.");
  }
  if (connection.port > 65535) {
    throw new Error("SNMP_PORT deve ser menor ou igual a 65535.");
  }

  const startedAt = Date.now();
  const identity = await readPrinterIdentity(connection);
  console.log(JSON.stringify({
    reachable: true,
    host: connection.host,
    port: connection.port,
    protocol: "SNMP v2c",
    elapsedMs: Date.now() - startedAt,
    ...identity,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    reachable: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
