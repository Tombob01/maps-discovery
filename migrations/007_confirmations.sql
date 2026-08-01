-- migrations/007_confirmations.sql
--
-- Introduces the confirmations table: the Confirmation boundary's
-- persistence layer (Family E architecture, Phase 3B / ADR-6).
--
-- Confirmation identity is resolved via proposal_id (Phase 3B-A):
-- multiple confirmation events may exist per proposal over its
-- lifetime (re-review, dispute, differing reviewers). Idempotency is
-- enforced via a uniqueness constraint on the triple
-- (proposal_id, decision, confirmed_by): an identical resubmission
-- collides with this constraint and, via ON CONFLICT ... DO UPDATE ...
-- RETURNING, returns the existing row rather than creating a
-- duplicate. A resubmission that differs in decision or confirmed_by
-- is a new, independent historical event and inserts normally. This
-- does not violate ADR-3's append-only invariant: no existing row's
-- meaningful data is ever modified, only prevented from duplicating.
--
-- No updated_at column or update trigger, matching the precedent set
-- by the proposals table: this is an immutable-event/snapshot table,
-- not a mutable entity.

CREATE TABLE IF NOT EXISTS confirmations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           UUID        NOT NULL REFERENCES proposals(id),
  candidate_fingerprint TEXT        NOT NULL,
  decision              TEXT        NOT NULL
                        CHECK (decision IN ('ratified','rejected')),
  confirmed_by          TEXT        NOT NULL,
  confirmed_at          TIMESTAMPTZ NOT NULL,
  confirmation_body     JSONB       NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_confirmations_idempotency UNIQUE (proposal_id, decision, confirmed_by)
);

CREATE INDEX IF NOT EXISTS idx_confirmations_proposal_id
  ON confirmations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_candidate_fingerprint
  ON confirmations(candidate_fingerprint);