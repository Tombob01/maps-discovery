/**
 * @module storage/PostgresClient
 *
 * Thin wrapper around a `pg` Pool.
 *
 * Responsibilities:
 *   - Hold the single Pool instance for the process lifetime.
 *   - Expose a typed `query` helper that forwards to pool.query().
 *   - Expose `transaction` for multi-statement atomic operations.
 *   - Expose `end` for graceful shutdown.
 *
 * Design notes:
 *   - Config is accepted as a plain object so callers are not coupled to
 *     the `pg` PoolConfig type directly; every field maps 1-to-1.
 *   - The class is intentionally not a singleton — tests can spin up
 *     multiple isolated instances pointing at different schemas.
 */

import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PostgresClientConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  /** Maximum number of clients in the pool. Default: 10. */
  readonly max?: number;
  /** Milliseconds a client can sit idle before being evicted. Default: 30 000. */
  readonly idleTimeoutMillis?: number;
  /** Milliseconds to wait for a connection before throwing. Default: 5 000. */
  readonly connectionTimeoutMillis?: number;
  /** Use SSL. Pass `true` for self-signed; pass a TLS options object for full control. */
  readonly ssl?: boolean | import("tls").ConnectionOptions;
}

// ---------------------------------------------------------------------------
// Row / query result helpers
// ---------------------------------------------------------------------------

/** A plain row returned by pg — values are unknown until cast by callers. */
export type Row = Record<string, unknown>;

/** Typed result of a pool.query() call. */
export interface QueryResult<T extends Row = Row> {
  readonly rows: T[];
  readonly rowCount: number | null;
}

// ---------------------------------------------------------------------------
// PostgresClient
// ---------------------------------------------------------------------------

export class PostgresClient {
  private readonly pool: pg.Pool;

  constructor(config: PostgresClientConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max ?? 10,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
      ssl: config.ssl as pg.PoolConfig["ssl"],
    });
  }

  // ---------------------------------------------------------------------------
  // query — execute a single parameterised statement
  // ---------------------------------------------------------------------------

  async query<T extends Row = Row>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(sql, params as unknown[]);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  // ---------------------------------------------------------------------------
  // transaction — run a callback inside BEGIN / COMMIT, with ROLLBACK on error
  // ---------------------------------------------------------------------------

  async transaction<T>(
    fn: (client: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txClient = new TransactionClient(client);
      const result = await fn(txClient);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // end — drain the pool (call once at process shutdown)
  // ---------------------------------------------------------------------------

  async end(): Promise<void> {
    await this.pool.end();
  }
}

// ---------------------------------------------------------------------------
// TransactionClient — scoped to a single checked-out client
// ---------------------------------------------------------------------------

export class TransactionClient {
  private readonly client: pg.PoolClient;

  constructor(client: pg.PoolClient) {
    this.client = client;
  }

  async query<T extends Row = Row>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    const result = await this.client.query<T>(sql, params as unknown[]);
    return { rows: result.rows, rowCount: result.rowCount };
  }
}
