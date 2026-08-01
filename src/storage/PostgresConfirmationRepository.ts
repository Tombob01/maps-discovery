/**
 * @module storage/PostgresConfirmationRepository
 *
 * Postgres-backed implementation of IConfirmationStore.
 *
 * Follows PostgresProposalRepository's conventions: full-JSONB
 * serialization of the domain object (confirmation_body) alongside
 * extracted columns for querying, a dedicated rowTo*() mapper
 * explicitly reviving Date fields, and hand-written parameterized SQL.
 *
 * save() enforces the ADR-6 idempotency triple
 * (proposal_id, decision, confirmed_by) via a single atomic
 * INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING statement. The
 * DO UPDATE clause is a no-op self-assignment (confirmed_by =
 * confirmations.confirmed_by), used solely so RETURNING fires on a
 * conflicting insert -- no meaningful data is modified, so this is not
 * a violation of ADR-3's append-only invariant. No
 * PostgresClient.transaction() usage is required or permitted in this
 * milestone.
 */

import type { Confirmation } from "../core/models/Confirmation.js";
import type { UUID } from "../core/types/common.js";
import type { IConfirmationStore, PersistedConfirmation } from "./IConfirmationStore.js";
import type { PostgresClient, Row } from "./PostgresClient.js";

interface ConfirmationRow extends Row {
  id: string;
  confirmation_body: unknown;
  created_at: Date;
}

function rowToPersistedConfirmation(row: ConfirmationRow): PersistedConfirmation {
  const rawBody = row.confirmation_body as Confirmation;
  const confirmation: Confirmation = {
    ...rawBody,
    confirmedAt: new Date(rawBody.confirmedAt as unknown as string),
  };
  return {
    id: row.id as UUID,
    confirmation,
    createdAt: row.created_at,
  };
}

export class PostgresConfirmationRepository implements IConfirmationStore {
  constructor(private readonly db: PostgresClient) {}

  async save(confirmation: Confirmation): Promise<PersistedConfirmation> {
    const sql =
      "INSERT INTO confirmations" +
      " (proposal_id, candidate_fingerprint, decision, confirmed_by, confirmed_at, confirmation_body)" +
      " VALUES ($1, $2, $3, $4, $5, $6)" +
      " ON CONFLICT (proposal_id, decision, confirmed_by)" +
      " DO UPDATE SET confirmed_by = confirmations.confirmed_by" +
      " RETURNING id, confirmation_body, created_at";
    const { rows } = await this.db.query<ConfirmationRow>(sql, [
      confirmation.proposalId,
      confirmation.candidateFingerprint,
      confirmation.decision,
      confirmation.confirmedBy,
      confirmation.confirmedAt,
      JSON.stringify(confirmation),
    ]);
    const row = rows[0];
    if (row === undefined) {
      throw new Error(
        "PostgresConfirmationRepository.save(): INSERT ... RETURNING produced no row",
      );
    }
    return rowToPersistedConfirmation(row);
  }

  async fetchById(id: UUID): Promise<PersistedConfirmation | null> {
    const sql =
      "SELECT id, confirmation_body, created_at" +
      " FROM confirmations" +
      " WHERE id = $1";
    const { rows } = await this.db.query<ConfirmationRow>(sql, [id]);
    const row = rows[0];
    return row !== undefined ? rowToPersistedConfirmation(row) : null;
  }

  async listByProposalId(proposalId: UUID): Promise<readonly PersistedConfirmation[]> {
    const sql =
      "SELECT id, confirmation_body, created_at" +
      " FROM confirmations" +
      " WHERE proposal_id = $1" +
      " ORDER BY created_at DESC";
    const { rows } = await this.db.query<ConfirmationRow>(sql, [proposalId]);
    return rows.map(rowToPersistedConfirmation);
  }
}