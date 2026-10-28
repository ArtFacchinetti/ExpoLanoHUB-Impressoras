export type PollLevel = "FAST" | "NORMAL";

export interface SnmpValue {
  oid: string;
  value: string;
}

export interface CounterReading {
  index: string;
  valueRaw: string;
}

export interface SupplyReading {
  index: string;
  description?: string;
  levelRaw?: string;
  maxCapacityRaw?: string;
  unitCodeRaw?: string;
}

export interface FastObservation {
  description: string;
  uptimeTicks?: bigint;
  printerState?: string;
  printerStateCode?: number;
  display?: string | null;
  partialErrors: string[];
}

export interface NormalObservation {
  description: string;
  counters?: CounterReading[];
  supplies?: SupplyReading[];
  partialErrors: string[];
}
