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
export type RehearsalQuery = (text: string) => Promise<Record<string, unknown>[]>;
export interface RehearsalCounts {
    rehearsal: "rolled_back";
    accounts: number;
    verified_addresses: number;
    password_accounts: number;
    /** Linked sign-in providers other than passwords, by provider id. */
    linked: Record<string, number>;
}
/** The counts the import left in the shared tables, read before rolling back. */
export declare function countsSql(prefix?: string): string;
/**
 * Open a transaction with `begin`, run the import and the counts through the
 * query it provides, then roll back. `begin` must roll back when its callback
 * throws (postgres-js `sql.begin`, or the pg adapter in ../bin).
 */
export declare function rehearseImport(options: {
    begin: (work: (query: RehearsalQuery) => Promise<void>) => Promise<void>;
    sql: string;
    prefix?: string;
}): Promise<RehearsalCounts>;
//# sourceMappingURL=import-rehearsal.d.ts.map