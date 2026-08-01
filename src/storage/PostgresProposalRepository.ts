/**
 * @module storage/PostgresProposalRepository
 *
 * Postgres-backed implementation of IProposalStore.
 *
 * Follows PostgresRawResultRepository's conventions: full-JSONB
 * serialization of the domain object (proposal_body), a dedicated
 * rowTo*() mapper explicitly reviving Date fields, and hand-written
 * string-concatenated SQL.
 *
 * No uniqueness constraint exists anywhere on the proposals table
 * (ADR-7) -- save() always performs a plain INSERT and relies on
 * RETURNING to obtain the DB-generated id and created_at.
 */

import type { IdentityProposal } from "../core/models/IdentityProposal.js";
import type { CandidateFingerprint } from "../core/models/CandidateIdentity.js";
import type { UUID } from "../core/types/common.js";
import type { IProposalStore, PersistedProposal } from "./IProposalStore.js";
import type { PostgresClient, Row } from "./PostgresClient.js";

interface ProposalRow extends Row {
  id: string;
  proposal_body: unknown;
  created_at: Date;
}

function rowToPersistedProposal(row: ProposalRow): PersistedProposal {
  const rawBody = row.proposal_body as IdentityProposal;
  const proposal: IdentityProposal = {
    ...rawBody,
    collectedAt: new Date(rawBody.collectedAt as unknown as string),
  };
  return {
    id: row.id as UUID,
    proposal,
    createdAt: row.created_at,
  };
}

export class PostgresProposalRepository implements IProposalStore {
  constructor(private readonly db: PostgresClient) {}

  async save(proposal: IdentityProposal): Promise<PersistedProposal> {
    const sql =
      "INSERT INTO proposals" +
      " (candidate_fingerprint, run_id, raw_result_id, proposal_body)" +
      " VALUES ($1, $2, $3, $4)" +
      " RETURNING id, proposal_body, created_at";
    const { rows } = await this.db.query<ProposalRow>(sql, [
      proposal.candidateFingerprint,
      proposal.runId,
      proposal.rawResultId,
      JSON.stringify(proposal),
    ]);
    const row = rows[0];
    if (row === undefined) {
      throw new Error(
        "PostgresProposalRepository.save(): INSERT ... RETURNING produced no row",
      );
    }
    return rowToPersistedProposal(row);
  }

  async fetchById(id: UUID): Promise<PersistedProposal | null> {
    const sql =
      "SELECT id, proposal_body, created_at" +
      " FROM proposals" +
      " WHERE id = $1";
    const { rows } = await this.db.query<ProposalRow>(sql, [id]);
    const row = rows[0];
    return row !== undefined ? rowToPersistedProposal(row) : null;
  }

  async listByCandidateFingerprint(
    candidateFingerprint: CandidateFingerprint,
  ): Promise<readonly PersistedProposal[]> {
    const sql =
      "SELECT id, proposal_body, created_at" +
      " FROM proposals" +
      " WHERE candidate_fingerprint = $1" +
      " ORDER BY created_at DESC";
    const { rows } = await this.db.query<ProposalRow>(sql, [
      candidateFingerprint,
    ]);
    return rows.map(rowToPersistedProposal);
  }
}