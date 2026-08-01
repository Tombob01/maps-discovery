/**
 * tests/unit/normalizer/confirmation.typecheck.test.ts
 *
 * Compile-time structural-separation checks only.
 */

import { describe, it } from "vitest";
import type { Confirmation } from "../../../src/core/models/Confirmation.js";
import type { BusinessRecord } from "../../../src/core/models/BusinessRecord.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";

describe("Structural separation: Confirmation vs BusinessRecord vs IdentityProposal (compile-time)", () => {
  it("Confirmation is not assignable to BusinessRecord", () => {
    function assertNotAssignableToBusinessRecord(confirmation: Confirmation): void {
      // @ts-expect-error — Confirmation lacks id, fingerprint, and all
      // status fields required by BusinessRecord.
      const asRecord: BusinessRecord = confirmation;
      void asRecord;
    }
    void assertNotAssignableToBusinessRecord;
  });

  it("Confirmation is not assignable to IdentityProposal", () => {
    function assertNotAssignableToProposal(confirmation: Confirmation): void {
      // @ts-expect-error — Confirmation lacks candidate content fields
      // required by IdentityProposal.
      const asProposal: IdentityProposal = confirmation;
      void asProposal;
    }
    void assertNotAssignableToProposal;
  });
});
