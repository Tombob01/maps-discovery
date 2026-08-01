/**
 * @module core/models/Confirmation
 *
 * Represents a single external confirmation act evaluating an
 * IdentityProposal. Per the frozen Family E architecture, this is the sole
 * point at which authority may originate — a Confirmation is produced only
 * by ConfirmationService, and only a ratified Confirmation may be shaped
 * into a BusinessRecord by BusinessRecordFactory.
 *
 * Deliberately excludes BusinessID, the authority fingerprint, and all
 * pipeline status fields, so Confirmation cannot be mistaken for, or
 * structurally substituted for, a BusinessRecord. Also deliberately
 * excludes full candidate content (name, address, phone, etc.), so
 * Confirmation cannot be mistaken for, or structurally substituted for,
 * an IdentityProposal.
 */

import type { CandidateFingerprint } from "./CandidateIdentity.js";
import type { UUID } from "../types/common.js";

export type ConfirmationDecision = "ratified" | "rejected";

/**
 * Fields shared by every Confirmation variant, regardless of decision.
 *
 * proposalId: the proposals.id of the specific persisted proposal
 * artifact this confirmation evaluated. Proposal identity is the
 * persisted proposal row's identity (proposals.id), not
 * candidateFingerprint -- multiple proposal snapshots may share a
 * candidateFingerprint, so this field is required to make "which
 * proposal was confirmed" unambiguous.
 */
interface ConfirmationBase {
  readonly proposalId: UUID;
  readonly candidateFingerprint: CandidateFingerprint;
  readonly confirmedBy: string;
  readonly confirmedAt: Date;
}

/**
 * A ratified Confirmation. Per ADR-5, this is the type
 * BusinessRecordFactory's hardened signature will eventually require
 * specifically (not Confirmation generally), closing the "ratified-only"
 * gap statically. That hardening is separate, later, ADR-9-sequenced
 * work -- not part of this milestone.
 */
export interface RatifiedConfirmation extends ConfirmationBase {
  readonly decision: "ratified";
}

/** A rejected Confirmation. */
export interface RejectedConfirmation extends ConfirmationBase {
  readonly decision: "rejected";
}

export type Confirmation = RatifiedConfirmation | RejectedConfirmation;
