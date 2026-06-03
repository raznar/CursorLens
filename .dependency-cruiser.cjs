/**
 * Enforces the layered architecture described in the `architecture-overview`
 * skill. Dependencies must flow one way:
 *
 *   app / components  ->  lib/sync (domain) + db (data access)
 *   lib/sync          ->  lib/cursor (API client) + db + shared lib
 *   lib/cursor        ->  shared lib only (never db / sync / ui)
 *   db                ->  shared lib only (never cursor / sync / ui)
 *
 * Run with: npm run boundaries
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make the graph impossible for agents to reason about.",
      from: {},
      to: { circular: true },
    },
    {
      name: "cursor-client-is-pure",
      severity: "error",
      comment: "The Cursor API client must not reach into the DB, sync engine, or UI.",
      from: { path: "^src/lib/cursor" },
      to: { path: "^src/(db|app|components|lib/sync)" },
    },
    {
      name: "db-is-pure",
      severity: "error",
      comment: "The data-access layer must not depend on the API client, sync engine, or UI.",
      from: { path: "^src/db" },
      to: { path: "^src/(app|components|lib/cursor|lib/sync)" },
    },
    {
      name: "api-client-no-ui",
      severity: "error",
      comment: "API client code is server-only and must never import UI.",
      from: { path: "^src/lib/(cursor|sync)" },
      to: { path: "^src/(app|components)" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Modules with no incoming/outgoing edges are usually dead code.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)index\\.tsx?$",
          "src/app/", // Next.js route entrypoints are reached by the framework
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
    },
  },
};
