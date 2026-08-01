/**
 * tests/unit/storage/confirmationRepository.test.ts
 *
 * Runtime behavioral tests for PostgresConfirmationRepository, stubbing
 * PostgresClient directly. Follows proposalRepository.test.ts's
 * stubbing conventions, extended to cover ADR-6 idempotency scenarios
 * specific to this store.
 */

import { describe, it, expect, vi } from "vitest";
import { PostgresConfirmationRepository } from "../../../src/storage/PostgresConfirmationRepository.js";
import type { Confirmation } from "../../../src/core/models/Confirmation.js";
import type { CandidateFingerprint } from "../../../src/core/models/CandidateIdentity.js";
import type { UUID } from "../../../src/core/types/common.js";
import type { PostgresClient } from "../../../src/storage/PostgresClient.js";

function makeConfirmation(overrides: Partial<Confirmation> = {}): Confirmation {
  return {
    proposalId: "33333333-3333-3333-3333-333333333333" as UUID,
    candidateFingerprint: "fp-abc" as CandidateFingerprint,
    decision: "ratified",
    confirmedBy: "reviewer-1",
    confirmedAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeStubClient(
  queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
): PostgresClient {
  return { query: vi.fn(queryImpl) } as unknown as PostgresClient;
}

describe("PostgresConfirmationRepository", () => {
  describe("save()", () => {
    it("inserts a new confirmation and returns a PersistedConfirmation with revived Date fields", async () => {
      const confirmation = makeConfirmation();
      const storedRow = {
        id: "44444444-4444-4444-4444-444444444444",
        confirmation_body: confirmation,
        created_at: new Date("2024-06-01T00:00:00Z"),
      };
      const db = makeStubClient(async (sql) => {
        expect(sql).toContain("INSERT INTO confirmations");
        expect(sql).toContain("ON CONFLICT (proposal_id, decision, confirmed_by)");
        expect(sql).toContain("DO UPDATE SET confirmed_by = confirmations.confirmed_by");
        expect(sql).toContain("RETURNING id, confirmation_body, created_at");
        return { rows: [storedRow] };
      });
      const repo = new PostgresConfirmationRepository(db);

      const result = await repo.save(confirmation);

      expect(result.id).toBe(storedRow.id);
      expect(result.createdAt).toEqual(storedRow.created_at);
      expect(result.confirmation.confirmedAt).toBeInstanceOf(Date);
      expect(result.confirmation.proposalId).toBe(confirmation.proposalId);
      expect(result.confirmation.decision).toBe(confirmation.decision);
    });

    it("passes proposalId, candidateFingerprint, decision, confirmedBy, confirmedAt, and the full serialized body as params", async () => {
      const confirmation = makeConfirmation();
      let capturedParams: unknown[] | undefined;
      const db = makeStubClient(async (_sql, params) => {
        capturedParams = params;
        return {
          rows: [
            {
              id: "44444444-4444-4444-4444-444444444444",
              confirmation_body: confirmation,
              created_at: new Date("2024-06-01T00:00:00Z"),
            },
          ],
        };
      });
      const repo = new PostgresConfirmationRepository(db);

      await repo.save(confirmation);

      expect(capturedParams).toBeDefined();
      expect(capturedParams?.[0]).toBe(confirmation.proposalId);
      expect(capturedParams?.[1]).toBe(confirmation.candidateFingerprint);
      expect(capturedParams?.[2]).toBe(confirmation.decision);
      expect(capturedParams?.[3]).toBe(confirmation.confirmedBy);
      expect(capturedParams?.[4]).toBe(confirmation.confirmedAt);
      expect(JSON.parse(capturedParams?.[5] as string)).toMatchObject({
        proposalId: confirmation.proposalId,
        decision: confirmation.decision,
      });
    });

    it("returns the existing persisted row when the idempotency triple is identical (idempotent no-op)", async () => {
      // Simulates the DB-side ON CONFLICT ... DO UPDATE ... RETURNING
      // behavior: a resubmission with the same (proposalId, decision,
      // confirmedBy) resolves to the original row's id, not a new one.
      const confirmation = makeConfirmation();
      const existingRow = {
        id: "44444444-4444-4444-4444-444444444444",
        confirmation_body: confirmation,
        created_at: new Date("2024-06-01T00:00:00Z"),
      };
      const db = makeStubClient(async () => ({ rows: [existingRow] }));
      const repo = new PostgresConfirmationRepository(db);

      const first = await repo.save(confirmation);
      const second = await repo.save(makeConfirmation());

      expect(second.id).toBe(first.id);
      expect(second.createdAt).toEqual(first.createdAt);
    });

    it("creates a new row when decision differs for the same proposalId", async () => {
      const ratified = makeConfirmation({ decision: "ratified" });
      const rejected = makeConfirmation({ decision: "rejected", confirmedBy: "reviewer-2" });
      const rows = {
        ratified: {
          id: "44444444-4444-4444-4444-444444444444",
          confirmation_body: ratified,
          created_at: new Date("2024-06-01T00:00:00Z"),
        },
        rejected: {
          id: "55555555-5555-5555-5555-555555555555",
          confirmation_body: rejected,
          created_at: new Date("2024-06-02T00:00:00Z"),
        },
      };
      const db = makeStubClient(async (_sql, params) => {
        const decision = params?.[2];
        return { rows: [decision === "rejected" ? rows.rejected : rows.ratified] };
      });
      const repo = new PostgresConfirmationRepository(db);

      const first = await repo.save(ratified);
      const second = await repo.save(rejected);

      expect(second.id).not.toBe(first.id);
      expect(second.confirmation.decision).toBe("rejected");
    });

    it("creates a new row when confirmedBy differs for the same proposalId", async () => {
      const reviewerOne = makeConfirmation({ confirmedBy: "reviewer-1" });
      const reviewerTwo = makeConfirmation({ confirmedBy: "reviewer-2" });
      const rows = {
        one: {
          id: "44444444-4444-4444-4444-444444444444",
          confirmation_body: reviewerOne,
          created_at: new Date("2024-06-01T00:00:00Z"),
        },
        two: {
          id: "66666666-6666-6666-6666-666666666666",
          confirmation_body: reviewerTwo,
          created_at: new Date("2024-06-03T00:00:00Z"),
        },
      };
      const db = makeStubClient(async (_sql, params) => {
        const confirmedBy = params?.[3];
        return { rows: [confirmedBy === "reviewer-2" ? rows.two : rows.one] };
      });
      const repo = new PostgresConfirmationRepository(db);

      const first = await repo.save(reviewerOne);
      const second = await repo.save(reviewerTwo);

      expect(second.id).not.toBe(first.id);
      expect(second.confirmation.confirmedBy).toBe("reviewer-2");
    });
  });

  describe("fetchById()", () => {
    it("returns null when no row matches", async () => {
      const db = makeStubClient(async () => ({ rows: [] }));
      const repo = new PostgresConfirmationRepository(db);

      const result = await repo.fetchById("does-not-exist" as UUID);

      expect(result).toBeNull();
    });

    it("returns the PersistedConfirmation when a row matches", async () => {
      const confirmation = makeConfirmation();
      const storedRow = {
        id: "44444444-4444-4444-4444-444444444444",
        confirmation_body: confirmation,
        created_at: new Date("2024-06-01T00:00:00Z"),
      };
      const db = makeStubClient(async (sql) => {
        expect(sql).toContain("FROM confirmations");
        expect(sql).toContain("WHERE id = $1");
        return { rows: [storedRow] };
      });
      const repo = new PostgresConfirmationRepository(db);

      const result = await repo.fetchById(storedRow.id as UUID);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(storedRow.id);
      expect(result?.confirmation.confirmedAt).toBeInstanceOf(Date);
    });
  });

  describe("listByProposalId()", () => {
    it("returns an empty array when no confirmations match", async () => {
      const db = makeStubClient(async () => ({ rows: [] }));
      const repo = new PostgresConfirmationRepository(db);

      const result = await repo.listByProposalId("77777777-7777-7777-7777-777777777777" as UUID);

      expect(result).toEqual([]);
    });

    it("maps every matching row, preserving the SQL-provided order", async () => {
      const confirmationA = makeConfirmation({ confirmedBy: "reviewer-1" });
      const confirmationB = makeConfirmation({ decision: "rejected", confirmedBy: "reviewer-2" });
      const rows = [
        {
          id: "aaaaaaaa-1111-1111-1111-111111111111",
          confirmation_body: confirmationB,
          created_at: new Date("2024-06-02T00:00:00Z"),
        },
        {
          id: "bbbbbbbb-2222-2222-2222-222222222222",
          confirmation_body: confirmationA,
          created_at: new Date("2024-06-01T00:00:00Z"),
        },
      ];
      const db = makeStubClient(async (sql) => {
        expect(sql).toContain("WHERE proposal_id = $1");
        expect(sql).toContain("ORDER BY created_at DESC");
        return { rows };
      });
      const repo = new PostgresConfirmationRepository(db);

      const result = await repo.listByProposalId(confirmationA.proposalId);

      expect(result).toHaveLength(2);
      expect(result[0]?.confirmation.decision).toBe("rejected");
      expect(result[1]?.confirmation.decision).toBe("ratified");
    });
  });
});