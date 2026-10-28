function integer(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} deve ser um inteiro maior ou igual a ${minimum}.`);
  }
  return value;
}

export const settings = {
  snmpCommunity: process.env.SNMP_COMMUNITY ?? "",
  snmpPort: integer("SNMP_PORT", 161, 1),
  snmpTimeoutMs: integer("SNMP_TIMEOUT_MS", 2000, 1),
  snmpRetries: integer("SNMP_RETRIES", 1, 0),
  printerHosts: (process.env.PRINTER_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  fastIntervalMs: integer("PRINTER_FAST_INTERVAL", 30, 1) * 1000,
  normalIntervalMs: integer("PRINTER_NORMAL_INTERVAL", 300, 1) * 1000,
  maxConcurrency: integer("PRINTER_MAX_CONCURRENCY", 5, 1),
};

if (!settings.snmpCommunity) {
  throw new Error("SNMP_COMMUNITY não foi definida.");
}
if (settings.snmpPort > 65535) {
  throw new Error("SNMP_PORT deve ser menor ou igual a 65535.");
}
