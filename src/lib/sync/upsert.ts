import "server-only";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { getTableConfig, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/db";

/**
 * Transactional, idempotent bulk upsert keyed on each table's primary key. This is the one
 * write path every sync job uses: rows are chunked (to stay under SQLite's bound-variable
 * limit), inserted inside a single transaction, and `ON CONFLICT DO UPDATE`d on the PK so a
 * re-sync of overlapping data is a no-op rather than a duplicate. See `sync-and-rate-limits`.
 */

type AnyTable = SQLiteTable & Record<string, unknown>;

/** Resolve a table's primary-key columns (handles single + composite PKs). */
function primaryKeyColumns(table: SQLiteTable): SQLiteColumn[] {
  const config = getTableConfig(table);
  const composite = config.primaryKeys.flatMap((pk) => pk.columns as SQLiteColumn[]);
  if (composite.length > 0) return composite;
  return config.columns.filter((c) => c.primary);
}

/**
 * Collapse rows that share a primary key, keeping the last occurrence. SQLite rejects a
 * single `INSERT ... ON CONFLICT DO UPDATE` whose VALUES touch the same key twice, so this
 * must run before chunking. Column property keys equal the snake_case column names here.
 */
function dedupeByPrimaryKey<Row extends Record<string, unknown>>(
  rows: Row[],
  keys: string[],
): Row[] {
  if (keys.length === 0) return rows;
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    byKey.set(keys.map((k) => String(row[k])).join("\u0000"), row);
  }
  return [...byKey.values()];
}

/**
 * Upsert `rows` into `table`. Non-PK columns are overwritten from the incoming row
 * (`excluded.*`). Returns the number of rows written. A no-op for an empty array.
 */
export function upsertRows<T extends SQLiteTable>(
  table: T,
  rows: Array<T["$inferInsert"]>,
): number {
  if (rows.length === 0) return 0;

  const columns = getTableColumns(table);
  const pkCols = primaryKeyColumns(table);
  const pkNames = new Set(pkCols.map((c) => c.name));
  const deduped = dedupeByPrimaryKey(
    rows as Array<Record<string, unknown>>,
    pkCols.map((c) => c.name),
  ) as Array<T["$inferInsert"]>;

  const updateSet: Record<string, SQL> = {};
  for (const [propertyKey, column] of Object.entries(columns)) {
    const col = column as SQLiteColumn;
    if (pkNames.has(col.name)) continue;
    updateSet[propertyKey] = sql.raw(`excluded.${col.name}`);
  }

  const target = (pkCols.length === 1 ? pkCols[0] : pkCols) as SQLiteColumn;
  const hasUpdatableColumns = Object.keys(updateSet).length > 0;

  // Keep each statement under SQLite's parameter cap (32766): bound by row width.
  const columnCount = Object.keys(columns).length || 1;
  const chunkSize = Math.max(1, Math.floor(20_000 / columnCount));

  const insertTable = table as AnyTable;

  db.transaction((tx) => {
    for (let offset = 0; offset < deduped.length; offset += chunkSize) {
      const batch = deduped.slice(offset, offset + chunkSize);
      const insert = tx.insert(insertTable).values(batch);
      if (hasUpdatableColumns) {
        insert.onConflictDoUpdate({ target, set: updateSet }).run();
      } else {
        insert.onConflictDoNothing({ target }).run();
      }
    }
  });

  return deduped.length;
}
