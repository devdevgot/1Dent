import { Queue, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import type { ExcelJobPayload, TrelloJobPayload, AiImportJobPayload } from "./migration.types";

const QUEUE_NAME = "migration";

type MigrationJobData =
  | ({ type: "excel-import" } & ExcelJobPayload)
  | ({ type: "trello-import" } & TrelloJobPayload)
  | ({ type: "ai-smart-import" } & AiImportJobPayload);

let _migrationQueue: Queue<MigrationJobData> | null = null;

if (process.env["REDIS_URL"]) {
  const connection = { url: process.env["REDIS_URL"] };

  _migrationQueue = new Queue<MigrationJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 3000 } },
  });

  new Worker<MigrationJobData>(
    QUEUE_NAME,
    async (job) => {
      const { MigrationService } = await import("./migration.service");
      const svc = new MigrationService();

      if (job.name === "excel-import") {
        await svc.processExcelJob(job.data as { type: "excel-import" } & ExcelJobPayload);
      } else if (job.name === "trello-import") {
        await svc.processTrelloJob(job.data as { type: "trello-import" } & TrelloJobPayload);
      } else if (job.name === "ai-smart-import") {
        await svc.processAiImportJob(job.data as { type: "ai-smart-import" } & AiImportJobPayload);
      }
    },
    { connection, concurrency: 2 },
  );

  logger.info("[MigrationQueue] BullMQ worker started (excel + trello + ai-smart-import processing)");
} else {
  logger.info("[MigrationQueue] REDIS_URL not set — migration jobs run inline async");
}

export function getMigrationQueue(): Queue<MigrationJobData> | null {
  return _migrationQueue;
}
