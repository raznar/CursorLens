import "server-only";
import { aiCodeChangeFiles, aiCodeChanges, aiCodeCommits } from "@/db/schema";
import { getMetric } from "@/lib/registry";
import type { DateWindow, PageBatch } from "@/lib/cursor";
import { upsertRows } from "../upsert";
import { parseTimestamp, windowLabel } from "./helpers";
import type { JobContext, SyncJob } from "./types";

/** "YYYY-MM-DD" for an epoch-ms instant (null-safe). */
function dayOf(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString().slice(0, 10);
}

/** Stream every window's pages, persisting each page, and mark the window covered. */
async function ingest<Item>(
  ctx: JobContext,
  label: string,
  pages: (window: DateWindow) => AsyncGenerator<PageBatch<Item>>,
  persist: (items: Item[]) => number,
): Promise<{ rows: number }> {
  let total = 0;
  const chunkTotal = ctx.chunks.length;
  for (const [index, chunk] of ctx.chunks.entries()) {
    const span = windowLabel(chunk.start, chunk.end);
    let windowRows = 0;
    ctx.reportProgress({
      current: index,
      total: chunkTotal,
      rows: total,
      message: `Fetching ${label} window ${index + 1}/${chunkTotal}: ${span}`,
    });
    for await (const page of pages(chunk)) {
      const written = persist(page.items);
      windowRows += written;
      total += written;
      ctx.reportProgress({
        current: index,
        total: chunkTotal,
        rows: total,
        message: `Window ${index + 1}/${chunkTotal} (${span}): page ${page.page}${page.totalPages ? `/${page.totalPages}` : ""}, ${windowRows.toLocaleString()} ${label} rows written`,
      });
    }
    ctx.markCovered(chunk, { rows: windowRows });
    ctx.reportProgress({
      current: index + 1,
      total: chunkTotal,
      rows: total,
      message: `Inserted ${windowRows.toLocaleString()} ${label} rows from ${span}`,
    });
  }
  return { rows: total };
}

/** GET /analytics/ai-code/commits — per-commit AI line attribution (Enterprise alpha). */
export const aiCodeCommitsJob: SyncJob = {
  dataType: "ai-code-commits",
  metricId: "ai-code-commits",
  label: getMetric("ai-code-commits")?.label ?? "AI code commits",
  enterpriseOnly: true,
  windowed: true,
  rateLimitGroup: "aiCodeCommits",
  run: (ctx) =>
    ingest(
      ctx,
      "AI code commit",
      (chunk) => ctx.client.aiCode.commitPages({ start: chunk.start, end: chunk.end }),
      (items) =>
        upsertRows(
          aiCodeCommits,
          items.map((c) => {
            const commitTs = parseTimestamp(c.commitTs);
            return {
              commit_hash: c.commitHash,
              created_at: parseTimestamp(c.createdAt) ?? commitTs ?? ctx.now,
              user_id: c.userId ?? null,
              user_email: c.userEmail ?? null,
              repo_name: c.repoName ?? null,
              branch_name: c.branchName ?? null,
              is_primary_branch: c.isPrimaryBranch ?? null,
              commit_source: c.commitSource ?? null,
              total_lines_added: c.totalLinesAdded ?? null,
              total_lines_deleted: c.totalLinesDeleted ?? null,
              tab_lines_added: c.tabLinesAdded ?? null,
              tab_lines_deleted: c.tabLinesDeleted ?? null,
              composer_lines_added: c.composerLinesAdded ?? null,
              composer_lines_deleted: c.composerLinesDeleted ?? null,
              non_ai_lines_added: c.nonAiLinesAdded ?? null,
              non_ai_lines_deleted: c.nonAiLinesDeleted ?? null,
              message: c.message ?? null,
              commit_ts: commitTs,
              commit_day: dayOf(commitTs),
            };
          }),
        ),
    ),
};

/** GET /analytics/ai-code/changes — accepted AI changes + per-file metadata (alpha). */
export const aiCodeChangesJob: SyncJob = {
  dataType: "ai-code-changes",
  metricId: "ai-code-changes",
  label: getMetric("ai-code-changes")?.label ?? "AI code changes",
  enterpriseOnly: true,
  windowed: true,
  rateLimitGroup: "aiCodeChanges",
  run: (ctx) =>
    ingest(
      ctx,
      "AI code change",
      (chunk) => ctx.client.aiCode.changePages({ start: chunk.start, end: chunk.end }),
      (items) => {
        const changes: Array<typeof aiCodeChanges.$inferInsert> = [];
        const files: Array<typeof aiCodeChangeFiles.$inferInsert> = [];
        for (const c of items) {
          const createdAt = parseTimestamp(c.createdAt);
          changes.push({
            change_id: c.changeId,
            user_id: c.userId ?? null,
            user_email: c.userEmail ?? null,
            source: c.source ?? null,
            model: c.model ?? null,
            total_lines_added: c.totalLinesAdded ?? null,
            total_lines_deleted: c.totalLinesDeleted ?? null,
            created_at: createdAt,
            created_day: dayOf(createdAt),
          });
          (c.metadata ?? []).forEach((f, idx) =>
            files.push({
              change_id: c.changeId,
              idx,
              file_name: f.fileName ?? null,
              file_extension: f.fileExtension ?? null,
              lines_added: f.linesAdded ?? null,
              lines_deleted: f.linesDeleted ?? null,
            }),
          );
        }
        return upsertRows(aiCodeChanges, changes) + upsertRows(aiCodeChangeFiles, files);
      },
    ),
};

export const aiCodeJobs: SyncJob[] = [aiCodeCommitsJob, aiCodeChangesJob];
