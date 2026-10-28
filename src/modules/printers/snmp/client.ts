import * as snmp from "net-snmp";
import type { FastObservation, NormalObservation, SnmpValue } from "../models";
import { normalizeFast, normalizeNormal } from "../normalizer";
import { OIDS } from "./oids";

export interface SnmpConnection {
  host: string;
  port: number;
  community: string;
  timeoutMs: number;
  retries: number;
}

export interface SnmpIdentity {
  oid: string;
  description: string;
}

function openSession(connection: SnmpConnection): snmp.Session {
  return snmp.createSession(connection.host, connection.community, {
    port: connection.port,
    version: snmp.Version2c,
    timeout: connection.timeoutMs,
    retries: connection.retries,
    transport: "udp4",
  });
}

function valueAsString(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return String(value);
}

async function getOids(connection: SnmpConnection, oids: string[]): Promise<SnmpValue[]> {
  const session = openSession(connection);
  try {
    return await new Promise<SnmpValue[]>((resolve, reject) => {
      session.on("error", reject);
      session.get(oids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }
        const values = (varbinds ?? [])
          .filter((varbind) => !snmp.isVarbindError(varbind))
          .map((varbind) => ({ oid: varbind.oid, value: valueAsString(varbind.value) }));
        if (values.length === 0) {
          reject(new Error("Nenhum dos OIDs solicitados retornou um valor válido."));
          return;
        }
        resolve(values);
      });
    });
  } finally {
    session.close();
  }
}

async function readSubtree(connection: SnmpConnection, root: string): Promise<SnmpValue[]> {
  const session = openSession(connection);
  const maxValues = 100;
  try {
    return await new Promise<SnmpValue[]>((resolve, reject) => {
      const values: SnmpValue[] = [];
      let truncated = false;
      session.on("error", reject);
      session.subtree(root, 10, (varbinds) => {
        for (const varbind of varbinds) {
          if (snmp.isVarbindError(varbind)) {
            continue;
          }
          values.push({ oid: varbind.oid, value: valueAsString(varbind.value) });
          if (values.length >= maxValues) {
            truncated = true;
            return true;
          }
        }
      }, (error) => {
        if (error) {
          reject(error);
        } else if (truncated) {
          reject(new Error(`Subárvore ${root} excedeu ${maxValues} valores.`));
        } else {
          resolve(values);
        }
      });
    });
  } finally {
    session.close();
  }
}

async function optionalSubtree(
  connection: SnmpConnection,
  root: string,
  errors: string[],
): Promise<SnmpValue[] | undefined> {
  try {
    return await readSubtree(connection, root);
  } catch (error) {
    errors.push(`${root}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export async function readPrinterIdentity(connection: SnmpConnection): Promise<SnmpIdentity> {
  const values = await getOids(connection, [OIDS.sysDescr]);
  return { oid: OIDS.sysDescr, description: values[0].value };
}

export async function readFast(connection: SnmpConnection): Promise<FastObservation> {
  const scalars = await getOids(connection, [OIDS.sysDescr, OIDS.sysUpTime]);
  const description = scalars.find((value) => value.oid === OIDS.sysDescr)?.value;
  if (!description) {
    throw new Error("sysDescr não retornou um valor válido.");
  }
  const errors: string[] = [];
  const status = await optionalSubtree(connection, OIDS.printerStatus, errors);
  const display = await optionalSubtree(connection, OIDS.display, errors);
  const uptime = scalars.find((value) => value.oid === OIDS.sysUpTime)?.value;
  return normalizeFast(description, uptime, status, display, errors);
}

export async function readNormal(connection: SnmpConnection): Promise<NormalObservation> {
  const identity = await readPrinterIdentity(connection);
  const errors: string[] = [];
  const counters = await optionalSubtree(connection, OIDS.markerLifeCount, errors);
  const descriptions = await optionalSubtree(connection, OIDS.supplyDescription, errors);
  const units = await optionalSubtree(connection, OIDS.supplyUnit, errors);
  const capacities = await optionalSubtree(connection, OIDS.supplyMaxCapacity, errors);
  const levels = await optionalSubtree(connection, OIDS.supplyLevel, errors);
  return normalizeNormal(identity.description, counters, descriptions, units, capacities, levels, errors);
}
