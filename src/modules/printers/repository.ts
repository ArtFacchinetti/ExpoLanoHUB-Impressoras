import type { Printer, PrinterStatus } from "../../generated/prisma/client";
import { database } from "../../shared/database";
import type { FastObservation, NormalObservation } from "./models";

type ChangeValue = string | boolean | null;
type Changes = Record<string, { old: ChangeValue; new: ChangeValue }>;

function addChange(changes: Changes, field: string, oldValue: ChangeValue, newValue: ChangeValue): void {
  if (oldValue !== newValue) {
    changes[field] = { old: oldValue, new: newValue };
  }
}

function errorText(errors: string[]): string | null {
  return errors.length ? errors.join("; ").slice(0, 1000) : null;
}

export async function listPrinters() {
  return database.printer.findMany({ orderBy: { ip: "asc" } });
}

export async function listPrinterStatuses() {
  return database.printer.findMany({
    orderBy: { ip: "asc" },
    include: { status: true },
  });
}

export async function getPrinter(id: string) {
  return database.printer.findUnique({ where: { id } });
}

export async function getPrinterStatus(id: string) {
  return database.printer.findUnique({ where: { id }, include: { status: true } });
}

export async function listEvents(printerId?: string) {
  return database.printerEvent.findMany({
    where: printerId ? { printerId } : undefined,
    orderBy: { timestamp: "desc" },
    take: 100,
  });
}

export async function upsertPrinter(ip: string) {
  return database.printer.upsert({
    where: { ip },
    create: { ip },
    update: {},
  });
}

export async function getEnabledPrinters() {
  return database.printer.findMany({ where: { enabled: true }, orderBy: { ip: "asc" } });
}

export async function saveFast(printer: Printer, observation: FastObservation): Promise<PrinterStatus> {
  const now = new Date();
  return database.$transaction(async (tx) => {
    const current = await tx.printerStatus.findUnique({ where: { printerId: printer.id } });
    const changes: Changes = {};
    addChange(changes, "online", current?.online ?? null, true);
    const state = observation.printerState ?? current?.printerState ?? null;
    const display = observation.display === undefined ? (current?.display ?? null) : observation.display;
    addChange(changes, "printerState", current?.printerState ?? null, state);
    addChange(changes, "display", current?.display ?? null, display);
    const changed = Object.keys(changes).length > 0;

    const status = await tx.printerStatus.upsert({
      where: { printerId: printer.id },
      create: {
        printerId: printer.id,
        online: true,
        printerState: state,
        printerStateCode: observation.printerStateCode,
        display,
        uptimeTicks: observation.uptimeTicks,
        consecutiveFailures: 0,
        lastPoll: now,
        lastSuccess: now,
        lastChange: changed ? now : null,
        lastError: errorText(observation.partialErrors),
      },
      update: {
        online: true,
        ...(observation.printerState !== undefined ? { printerState: observation.printerState } : {}),
        ...(observation.printerStateCode !== undefined ? { printerStateCode: observation.printerStateCode } : {}),
        ...(observation.display !== undefined ? { display: observation.display } : {}),
        ...(observation.uptimeTicks !== undefined ? { uptimeTicks: observation.uptimeTicks } : {}),
        consecutiveFailures: 0,
        lastPoll: now,
        lastSuccess: now,
        lastError: errorText(observation.partialErrors),
        ...(changed ? { lastChange: now } : {}),
      },
    });

    if (printer.description !== observation.description) {
      await tx.printer.update({ where: { id: printer.id }, data: { description: observation.description } });
    }
    if (changed) {
      await tx.printerEvent.create({
        data: { printerId: printer.id, timestamp: now, type: "state_changed", changes },
      });
    }
    return status;
  });
}

export async function saveNormal(printer: Printer, observation: NormalObservation): Promise<PrinterStatus> {
  const now = new Date();
  const counters = observation.counters?.map((item) => ({ index: item.index, valueRaw: item.valueRaw }));
  const supplies = observation.supplies?.map((item) => ({
    index: item.index,
    ...(item.description !== undefined ? { description: item.description } : {}),
    ...(item.levelRaw !== undefined ? { levelRaw: item.levelRaw } : {}),
    ...(item.maxCapacityRaw !== undefined ? { maxCapacityRaw: item.maxCapacityRaw } : {}),
    ...(item.unitCodeRaw !== undefined ? { unitCodeRaw: item.unitCodeRaw } : {}),
  }));
  return database.$transaction(async (tx) => {
    const current = await tx.printerStatus.findUnique({ where: { printerId: printer.id } });
    const changes: Changes = {};
    addChange(changes, "online", current?.online ?? null, true);
    const changed = Object.keys(changes).length > 0;
    const status = await tx.printerStatus.upsert({
      where: { printerId: printer.id },
      create: {
        printerId: printer.id,
        online: true,
        counters,
        supplies,
        consecutiveFailures: 0,
        lastPoll: now,
        lastSuccess: now,
        lastChange: changed ? now : null,
        lastError: errorText(observation.partialErrors),
      },
      update: {
        online: true,
        ...(counters !== undefined ? { counters } : {}),
        ...(supplies !== undefined ? { supplies } : {}),
        consecutiveFailures: 0,
        lastPoll: now,
        lastSuccess: now,
        lastError: errorText(observation.partialErrors),
        ...(changed ? { lastChange: now } : {}),
      },
    });
    if (printer.description !== observation.description) {
      await tx.printer.update({ where: { id: printer.id }, data: { description: observation.description } });
    }
    if (changed) {
      await tx.printerEvent.create({
        data: { printerId: printer.id, timestamp: now, type: "state_changed", changes },
      });
    }
    if (counters?.length) {
      await tx.printerMetric.create({
        data: { printerId: printer.id, timestamp: now, values: { counters } },
      });
    }
    return status;
  });
}

export async function saveFailure(printerId: string, message: string): Promise<PrinterStatus> {
  const now = new Date();
  return database.$transaction(async (tx) => {
    const current = await tx.printerStatus.findUnique({ where: { printerId } });
    const failures = (current?.consecutiveFailures ?? 0) + 1;
    const online = failures >= 3 ? false : (current?.online ?? null);
    const changed = (current?.online ?? null) !== online;
    const status = await tx.printerStatus.upsert({
      where: { printerId },
      create: {
        printerId,
        online,
        consecutiveFailures: failures,
        lastPoll: now,
        lastFailure: now,
        lastChange: changed ? now : null,
        lastError: message.slice(0, 1000),
      },
      update: {
        online,
        consecutiveFailures: failures,
        lastPoll: now,
        lastFailure: now,
        lastError: message.slice(0, 1000),
        ...(changed ? { lastChange: now } : {}),
      },
    });
    if (changed) {
      await tx.printerEvent.create({
        data: {
          printerId,
          timestamp: now,
          type: "state_changed",
          changes: { online: { old: current?.online ?? null, new: online } },
        },
      });
    }
    return status;
  });
}
