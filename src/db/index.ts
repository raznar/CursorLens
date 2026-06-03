/**
 * Public entrypoint for the data-access layer. App + sync code should import from `@/db`:
 *
 *   import { db, schema, type DailyUsage } from "@/db";
 *
 * Re-exports the server-only client (`db`, `sqlite`), every table + inferred row type, and
 * a `schema` namespace for `drizzle(sqlite, { schema })`-style usage. Importing this module
 * pulls in `server-only` (via `./client`), so it is server-only too — do not import it from
 * tests or build scripts; import `./schema` directly there instead.
 */
export { db, sqlite } from "./client";
export * from "./schema";
export * as schema from "./schema";
