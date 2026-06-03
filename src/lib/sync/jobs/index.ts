import "server-only";
import { adminJobs } from "./admin";
import { analyticsByUserJobs } from "./analytics-by-user";
import { analyticsTeamJobs } from "./analytics-team";
import type { SyncJob } from "./types";

/**
 * Every sync job, in run order: Admin first (cheap, populates the roster), then team
 * analytics, then by-user analytics. The engine runs each in isolation, so order only
 * affects which data lands first — one failing job never aborts the rest.
 */
export const SYNC_JOBS: SyncJob[] = [...adminJobs, ...analyticsTeamJobs, ...analyticsByUserJobs];

const JOB_BY_DATA_TYPE = new Map(SYNC_JOBS.map((job) => [job.dataType, job]));

export function getSyncJob(dataType: string): SyncJob | undefined {
  return JOB_BY_DATA_TYPE.get(dataType);
}

export type { JobContext, JobResult, SyncJob, SyncMode } from "./types";
