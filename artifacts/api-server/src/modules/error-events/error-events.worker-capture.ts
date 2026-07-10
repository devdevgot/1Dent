import type { Job } from "bullmq";
import { logger } from "../../lib/logger";
import { errorEventsService } from "./error-events.service";

export function captureWorkerJobError(
  queueName: string,
  job: Job | undefined,
  err: Error,
): void {
  errorEventsService.captureSafe({
    source: "worker",
    severity: "error",
    message: err.message || "BullMQ job failed",
    stack: err.stack ?? null,
    code: "BULLMQ_JOB_FAILED",
    metadata: {
      queue: queueName,
      jobId: job?.id ?? null,
      jobName: job?.name ?? null,
      attemptsMade: job?.attemptsMade ?? null,
    },
  });
}

export function attachWorkerFailedHandler(
  worker: { on(event: "failed", handler: (job: Job | undefined, err: Error) => void): void },
  queueName: string,
): void {
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err, queue: queueName }, "BullMQ job failed");
    captureWorkerJobError(queueName, job, err);
  });
}
