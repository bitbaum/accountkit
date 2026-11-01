#!/usr/bin/env node
/**
 * accountkit-rehearse-import <import.sql> [--prefix auth_]
 *
 * Rehearses a product's account import against DATABASE_URL in one
 * transaction that always rolls back, and prints only counts as JSON. There is
 * no apply mode. It takes locks even though it rolls back, so never point it
 * at the served database. It uses the product's own driver: `pg` or
 * `postgres`, resolved from the working directory.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { rehearseImport, } from "../auth/import-rehearsal.js";
/** A transaction runner over whichever Postgres driver the product has. */
function driver(url) {
    const load = createRequire(join(process.cwd(), "package.json"));
    try {
        const pg = load("pg");
        const pool = new pg.Pool({
            connectionString: url,
            connectionTimeoutMillis: 5000,
            max: 1,
        });
        return {
            begin: async (work) => {
                const client = await pool.connect();
                try {
                    await client.query("BEGIN");
                    await work(async (text) => (await client.query(text)).rows);
                }
                finally {
                    await client.query("ROLLBACK").catch(() => { });
                    client.release();
                }
            },
            end: () => pool.end(),
        };
    }
    catch {
        // Not installed here; try postgres-js.
    }
    const postgres = load("postgres");
    const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => { } });
    return {
        begin: async (work) => {
            await sql.begin(async (tx) => {
                await work(async (text) => [...(await tx.unsafe(text))]);
            });
        },
        end: () => sql.end(),
    };
}
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const prefixAt = args.indexOf("--prefix");
const prefix = prefixAt >= 0 ? args[prefixAt + 1] : "auth_";
if (!file) {
    console.error("usage: accountkit-rehearse-import <import.sql> [--prefix auth_]");
    process.exit(2);
}
if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(2);
}
const db = driver(process.env.DATABASE_URL);
try {
    const counts = await rehearseImport({
        begin: db.begin,
        sql: await readFile(resolve(file), "utf8"),
        prefix,
    });
    console.log(JSON.stringify(counts));
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
finally {
    await db.end();
}
//# sourceMappingURL=rehearse-import.js.map