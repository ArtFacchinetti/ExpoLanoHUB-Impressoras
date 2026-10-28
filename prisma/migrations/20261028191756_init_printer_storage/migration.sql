-- CreateTable
CREATE TABLE "printers" (
    "id" UUID NOT NULL,
    "ip" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_status" (
    "printer_id" UUID NOT NULL,
    "online" BOOLEAN,
    "printer_state" TEXT,
    "printer_state_code" INTEGER,
    "display" TEXT,
    "uptime_ticks" BIGINT,
    "counters" JSONB,
    "supplies" JSONB,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_poll" TIMESTAMP(3),
    "last_success" TIMESTAMP(3),
    "last_failure" TIMESTAMP(3),
    "last_change" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "printer_status_pkey" PRIMARY KEY ("printer_id")
);

-- CreateTable
CREATE TABLE "printer_events" (
    "id" UUID NOT NULL,
    "printer_id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "changes" JSONB NOT NULL,

    CONSTRAINT "printer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_metrics" (
    "id" UUID NOT NULL,
    "printer_id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "values" JSONB NOT NULL,

    CONSTRAINT "printer_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "printers_ip_key" ON "printers"("ip");

-- CreateIndex
CREATE INDEX "printer_events_printer_id_timestamp_idx" ON "printer_events"("printer_id", "timestamp");

-- CreateIndex
CREATE INDEX "printer_metrics_printer_id_timestamp_idx" ON "printer_metrics"("printer_id", "timestamp");

-- AddForeignKey
ALTER TABLE "printer_status" ADD CONSTRAINT "printer_status_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_events" ADD CONSTRAINT "printer_events_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_metrics" ADD CONSTRAINT "printer_metrics_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
