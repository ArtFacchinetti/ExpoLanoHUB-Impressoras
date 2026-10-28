import * as snmp from "net-snmp";

const SYS_DESCR_OID = "1.3.6.1.2.1.1.1.0";

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

export async function readPrinterIdentity(connection: SnmpConnection): Promise<SnmpIdentity> {
  const session = snmp.createSession(connection.host, connection.community, {
    port: connection.port,
    version: snmp.Version2c,
    timeout: connection.timeoutMs,
    retries: connection.retries,
    transport: "udp4",
  });

  try {
    return await new Promise<SnmpIdentity>((resolve, reject) => {
      session.on("error", reject);
      session.get([SYS_DESCR_OID], (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const varbind = varbinds?.[0];
        if (!varbind) {
          reject(new Error("A impressora não retornou o OID solicitado."));
          return;
        }
        if (snmp.isVarbindError(varbind)) {
          reject(new Error(snmp.varbindError(varbind)));
          return;
        }

        resolve({
          oid: SYS_DESCR_OID,
          description: String(varbind.value),
        });
      });
    });
  } finally {
    session.close();
  }
}
