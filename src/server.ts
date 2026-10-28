import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { database } from "./shared/database";
import { PrinterScheduler } from "./modules/printers/scheduler";
import { PrinterService } from "./modules/printers/service";
import type { PollLevel } from "./modules/printers/models";

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const service = new PrinterService();
const scheduler = new PrinterScheduler(service);

function send(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let content = "";
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 65536) {
      throw new HttpError(413, "Corpo da requisição muito grande.");
    }
  }
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Objeto JSON esperado.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Envie um objeto JSON válido.");
  }
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = request.method;

  if (method === "GET" && path === "/health") {
    await database.printer.count();
    send(response, 200, { status: "ok", database: "ok" });
    return;
  }
  if (method === "GET" && path === "/printers") {
    send(response, 200, await service.listPrinters());
    return;
  }
  if (method === "GET" && path === "/printers/status") {
    send(response, 200, await service.listStatuses());
    return;
  }
  if (method === "GET" && path === "/printers/events") {
    send(response, 200, await service.listEvents(url.searchParams.get("printerId") ?? undefined));
    return;
  }
  if (method === "POST" && path === "/printers") {
    const body = await readBody(request);
    if (typeof body.ip !== "string") {
      throw new HttpError(400, "Informe o campo ip.");
    }
    try {
      send(response, 200, await service.register(body.ip.trim()));
    } catch (error) {
      if (error instanceof Error && error.message.includes("IPv4")) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
    return;
  }

  const statusMatch = /^\/printers\/([^/]+)\/status$/.exec(path);
  if (method === "GET" && statusMatch) {
    const printer = await service.getStatus(statusMatch[1]);
    if (!printer) {
      throw new HttpError(404, "Impressora não encontrada.");
    }
    send(response, 200, printer);
    return;
  }

  const pollMatch = /^\/printers\/([^/]+)\/poll$/.exec(path);
  if (method === "POST" && pollMatch) {
    const body = await readBody(request);
    if (body.level !== "FAST" && body.level !== "NORMAL") {
      throw new HttpError(400, "level deve ser FAST ou NORMAL.");
    }
    try {
      const result = await service.poll(pollMatch[1], body.level as PollLevel);
      send(response, 200, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Impressora não encontrada.") {
        throw new HttpError(404, error.message);
      }
      throw error;
    }
    return;
  }

  throw new HttpError(404, "Rota não encontrada.");
}

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    if (error instanceof HttpError) {
      send(response, error.status, { error: error.message });
      return;
    }
    console.error("Falha na API:", error);
    send(response, 500, { error: "Erro interno." });
  });
});

async function start(): Promise<void> {
  await database.$connect();
  await service.bootstrap();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`API de impressoras ouvindo na porta ${port}`);
    scheduler.start();
  });
}

async function stop(): Promise<void> {
  await scheduler.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.$disconnect();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

start().catch(async (error: unknown) => {
  console.error("Não foi possível iniciar a API:", error);
  await database.$disconnect();
  process.exitCode = 1;
});
