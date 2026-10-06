import "server-only";
import { adminJobs } from "./admin";
import { aiCodeJobs } from "./ai-code";
import { analyticsByUserJobs } from "./analytics-by-user";
import { analyticsTeamJobs } from "./analytics-team";
import type { SyncJob } from "./types";

/**
 * Every sync job, in run order: Admin first (cheap, populates the roster), then team
 * analytics, then by-user analytics, then AI Code Tracking. The engine runs each in
 * isolation (and lanes concurrently), so order only affects which data lands first within
 * a lane — one failing job never aborts the rest.
 */
export const SYNC_JOBS: SyncJob[] = [
  ...adminJobs,
  ...analyticsTeamJobs,
  ...analyticsByUserJobs,
  ...aiCodeJobs,
];

const JOB_BY_DATA_TYPE = new Map(SYNC_JOBS.map((job) => [job.dataType, job]));

export function getSyncJob(dataType: string): SyncJob | undefined {
  return JOB_BY_DATA_TYPE.get(dataType);
}

export type { JobContext, JobResult, SyncJob, SyncMode } from "./types";
