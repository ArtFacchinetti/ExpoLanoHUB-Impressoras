import type { CounterReading, FastObservation, NormalObservation, SnmpValue, SupplyReading } from "./models";
import { OIDS } from "./snmp/oids";

function indexOf(oid: string, root: string): string {
  return oid.slice(root.length + 1);
}

const stateNames: Record<number, string> = {
  1: "other",
  2: "unknown",
  3: "idle",
  4: "printing",
  5: "warmup",
};

export function normalizeFast(
  description: string,
  uptimeRaw: string | undefined,
  statusValues: SnmpValue[] | undefined,
  displayValues: SnmpValue[] | undefined,
  partialErrors: string[],
): FastObservation {
  const uptime = uptimeRaw && /^\d+$/.test(uptimeRaw) ? BigInt(uptimeRaw) : undefined;
  const stateRaw = statusValues?.[0]?.value;
  const stateCode = stateRaw && /^\d+$/.test(stateRaw) ? Number(stateRaw) : undefined;
  const display = displayValues === undefined
    ? undefined
    : (displayValues.map((entry) => entry.value.trim()).find(Boolean) ?? null);

  return {
    description,
    uptimeTicks: uptime,
    printerStateCode: stateCode,
    printerState: stateCode === undefined ? undefined : (stateNames[stateCode] ?? "unknown"),
    display,
    partialErrors,
  };
}

export function normalizeNormal(
  description: string,
  countersRaw: SnmpValue[] | undefined,
  descriptionRaw: SnmpValue[] | undefined,
  unitRaw: SnmpValue[] | undefined,
  capacityRaw: SnmpValue[] | undefined,
  levelRaw: SnmpValue[] | undefined,
  partialErrors: string[],
): NormalObservation {
  const counters: CounterReading[] | undefined = countersRaw?.map(({ oid, value }) => ({
    index: indexOf(oid, OIDS.markerLifeCount),
    valueRaw: value,
  }));

  const supplies = new Map<string, SupplyReading>();
  const add = (values: SnmpValue[] | undefined, root: string, field: keyof SupplyReading) => {
    for (const { oid, value } of values ?? []) {
      const index = indexOf(oid, root);
      const supply = supplies.get(index) ?? { index };
      supply[field] = value;
      supplies.set(index, supply);
    }
  };
  add(descriptionRaw, OIDS.supplyDescription, "description");
  add(unitRaw, OIDS.supplyUnit, "unitCodeRaw");
  add(capacityRaw, OIDS.supplyMaxCapacity, "maxCapacityRaw");
  add(levelRaw, OIDS.supplyLevel, "levelRaw");

  const completeSupplyRead = [descriptionRaw, unitRaw, capacityRaw, levelRaw].every(
    (values) => values !== undefined,
  );

  return {
    description,
    counters,
    supplies: completeSupplyRead ? [...supplies.values()] : undefined,
    partialErrors,
  };
}
