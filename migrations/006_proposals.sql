-- migrations/006_proposals.sql
--
-- Introduces the proposals table: the Proposal boundary's persistence
-- layer (Family E architecture, Phase 3A / ADR-7).
--
-- Every IdentityProposal produced by ProposalBuilder is persisted here
-- verbatim (proposal_body JSONB), so that a later Confirmation can be
-- evaluated against a fixed, inspectable artifact rather than a value
-- re-derived on demand -- recompute-on-demand was considered and
-- explicitly rejected on auditability grounds (ADR-7).
--
-- Deliberately has NO uniqueness constraint of any kind, on any column,
-- including raw_result_id. Replay/versioning semantics for proposals
-- are explicitly undecided (ADR-7), and this table must not silently
-- foreclose them by accident. Every save() call performs a plain
-- INSERT.

CREATE TABLE IF NOT EXISTS proposals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_fingerprint TEXT        NOT NULL,
  run_id                UUID        NOT NULL REFERENCES runs(id),
  raw_result_id         UUID        NOT NULL REFERENCES raw_results(id),
  proposal_body         JSONB       NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_candidate_fingerprint
  ON proposals(candidate_fingerprint);
CREATE INDEX IF NOT EXISTS idx_proposals_run_id
  ON proposals(run_id);
CREATE INDEX IF NOT EXISTS idx_proposals_raw_result_id
  ON proposals(raw_result_id);