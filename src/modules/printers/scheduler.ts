import { settings } from "../../shared/settings";
import type { PollLevel } from "./models";
import { PrinterService } from "./service";

export class PrinterScheduler {
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<PollLevel>();
  private readonly jobs = new Set<Promise<void>>();

  constructor(private readonly service: PrinterService) {}

  start(): void {
    this.trigger("FAST");
    this.trigger("NORMAL");
    this.timers.push(setInterval(() => this.trigger("FAST"), settings.fastIntervalMs));
    this.timers.push(setInterval(() => this.trigger("NORMAL"), settings.normalIntervalMs));
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers.length = 0;
    await Promise.allSettled([...this.jobs]);
  }

  private trigger(level: PollLevel): void {
    const job = this.run(level);
    this.jobs.add(job);
    void job.finally(() => this.jobs.delete(job));
  }

  private async run(level: PollLevel): Promise<void> {
    if (this.running.has(level)) {
      return;
    }
    this.running.add(level);
    try {
      const printers = await this.service.listEnabled();
      const outcomes = await Promise.allSettled(printers.map((printer) => this.service.poll(printer.id, level)));
      for (let index = 0; index < outcomes.length; index++) {
        const outcome = outcomes[index];
        if (outcome.status === "rejected") {
          console.error(`Falha no poll ${level} de ${printers[index].ip}:`, outcome.reason);
        } else if (!outcome.value.success) {
          console.warn(`SNMP indisponível em ${printers[index].ip}: ${outcome.value.error}`);
        }
      }
    } catch (error) {
      console.error(`Falha no agendamento ${level}:`, error);
    } finally {
      this.running.delete(level);
    }
  }
}
