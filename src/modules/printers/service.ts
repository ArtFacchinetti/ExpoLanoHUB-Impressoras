import { isIP } from "node:net";
import type { PrinterStatus } from "../../generated/prisma/client";
import { settings } from "../../shared/settings";
import type { PollLevel } from "./models";
import * as repository from "./repository";
import { readFast, readNormal, type SnmpConnection } from "./snmp/client";

export interface PollOutcome {
  printerId: string;
  level: PollLevel;
  success: boolean;
  status: PrinterStatus;
  error?: string;
}

class Limiter {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.maximum) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    return () => {
      const next = this.waiters.shift();
      if (next) {
        next();
      } else {
        this.active--;
      }
    };
  }
}

export class PrinterService {
  private readonly limiter = new Limiter(settings.maxConcurrency);
  private readonly ongoing = new Map<string, Promise<PollOutcome>>();

  async bootstrap(): Promise<void> {
    for (const ip of new Set(settings.printerHosts)) {
      await this.register(ip);
    }
  }

  async register(ip: string) {
    if (isIP(ip) !== 4) {
      throw new Error("Informe um endereço IPv4 válido.");
    }
    return repository.upsertPrinter(ip);
  }

  listPrinters() {
    return repository.listPrinters();
  }

  listStatuses() {
    return repository.listPrinterStatuses();
  }

  getStatus(id: string) {
    return repository.getPrinterStatus(id);
  }

  listEvents(printerId?: string) {
    return repository.listEvents(printerId);
  }

  listEnabled() {
    return repository.getEnabledPrinters();
  }

  async poll(printerId: string, level: PollLevel): Promise<PollOutcome> {
    const previous = this.ongoing.get(printerId);
    const run = (async () => {
      await previous?.catch(() => undefined);
      return this.performPoll(printerId, level);
    })();
    this.ongoing.set(printerId, run);
    try {
      return await run;
    } finally {
      if (this.ongoing.get(printerId) === run) {
        this.ongoing.delete(printerId);
      }
    }
  }

  private async performPoll(printerId: string, level: PollLevel): Promise<PollOutcome> {
    const printer = await repository.getPrinter(printerId);
    if (!printer) {
      throw new Error("Impressora não encontrada.");
    }
    const connection: SnmpConnection = {
      host: printer.ip,
      port: settings.snmpPort,
      community: settings.snmpCommunity,
      timeoutMs: settings.snmpTimeoutMs,
      retries: settings.snmpRetries,
    };
    const release = await this.limiter.acquire();
    try {
      if (level === "FAST") {
        let observation;
        try {
          observation = await readFast(connection);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = await repository.saveFailure(printerId, message);
          return { printerId, level, success: false, status, error: message };
        }
        const status = await repository.saveFast(printer, observation);
        return { printerId, level, success: true, status };
      }

      let observation;
      try {
        observation = await readNormal(connection);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = await repository.saveFailure(printerId, message);
        return { printerId, level, success: false, status, error: message };
      }
      const status = await repository.saveNormal(printer, observation);
      return { printerId, level, success: true, status };
    } finally {
      release();
    }
  }
}
