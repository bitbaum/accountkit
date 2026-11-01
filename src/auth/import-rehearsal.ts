/**
 * Rehearse a product's account import (its own SQL, which copies its people
 * into AccountKit's tables) inside one transaction that always rolls back,
 * and report only counts. Constraint errors can carry addresses or hashes, so
 * a failure reports a fixed sentence and never the database's message.
 *
 * The product's SQL refuses drift, collisions and a live shared runtime itself;
 * this only runs it and counts what it would have written.
 */

/** Runs one SQL text inside the rehearsal's transaction and returns its rows. */
export type RehearsalQuery = (
  text: string,
) => Promise<Record<string, unknown>[]>;

export interface RehearsalCounts {
  rehearsal: "rolled_back";
  accounts: number;
  verified_addresses: number;
  password_accounts: number;
  /** Linked sign-in providers other than passwords, by provider id. */
  linked: Record<string, number>;
}

const ROLLBACK = Symbol("rollback");

/** The counts the import left in the shared tables, read before rolling back. */
export function countsSql(prefix = "auth_"): string {
  if (!/^[a-z_]*$/.test(prefix))
    throw new Error("table prefix must be lower-case letters and _");
  return `SELECT
    (SELECT count(*)::int FROM ${prefix}users) AS accounts,
    (SELECT count(*)::int FROM ${prefix}users WHERE email_verified) AS verified_addresses,
    (SELECT count(*)::int FROM ${prefix}accounts WHERE provider_id = 'credential') AS password_accounts,
    (SELECT coalesce(json_object_agg(provider_id, n), '{}'::json) FROM
      (SELECT provider_id, count(*)::int AS n FROM ${prefix}accounts
       WHERE provider_id <> 'credential' GROUP BY provider_id) linked) AS linked`;
}

/**
 * Open a transaction with `begin`, run the import and the counts through the
 * query it provides, then roll back. `begin` must roll back when its callback
 * throws (postgres-js `sql.begin`, or the pg adapter in ../bin).
 */
export async function rehearseImport(options: {
  begin: (work: (query: RehearsalQuery) => Promise<void>) => Promise<void>;
  sql: string;
  prefix?: string;
}): Promise<RehearsalCounts> {
  let counts: RehearsalCounts | undefined;
  try {
    await options.begin(async (query) => {
      await query("SET LOCAL lock_timeout = '5s'");
      await query("SET LOCAL statement_timeout = '30s'");
      await query(options.sql);
      const [row] = await query(countsSql(options.prefix));
      counts = {
        rehearsal: "rolled_back",
        accounts: Number(row.accounts),
        verified_addresses: Number(row.verified_addresses),
        password_accounts: Number(row.password_accounts),
        linked: (row.linked ?? {}) as Record<string, number>,
      };
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) {
      // The message is fixed (the database's can carry addresses or hashes);
      // the cause stays attached for a debugger, never printed by the CLI.
      throw new Error(
        "Account import rehearsal failed; transaction rolled back",
        {
          cause: error,
        },
      );
    }
  }
  if (!counts)
    throw new Error("Account import rehearsal failed; transaction rolled back");
  return counts;
}
