/**
 * tests/unit/normalizer/identityProposal.typecheck.test.ts
 *
 * Compile-time structural-separation check only. This file verifies, via
 * the TypeScript compiler (not runtime behavior), that IdentityProposal
 * is not assignable to BusinessRecord. No runtime assertions belong in
 * this file — runtime behavior of ProposalBuilder is covered separately
 * in proposalBuilder.test.ts.
 *
 * This file must fail `npm run typecheck:tests` if the @ts-expect-error
 * below stops being necessary (i.e., if IdentityProposal ever became
 * structurally assignable to BusinessRecord, which would indicate the
 * Proposal/Authority boundary has been broken).
 */

import { describe, it } from "vitest";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";

describe("Structural separation: IdentityProposal vs BusinessRecord (compile-time)", () => {
  it("is a type-only check; presence of this test is a placeholder for the compiler assertion below", () => {
    function assertNotAssignable(proposal: IdentityProposal): void {
      // @ts-expect-error — IdentityProposal is missing id, fingerprint, and
      // all status fields required by BusinessRecord; this assignment must
      // fail to compile, proving the two representations are structurally
      // non-interchangeable.
      const asRecord: BusinessRecord = proposal;
      void asRecord;
    }
    void assertNotAssignable;
  });
});
