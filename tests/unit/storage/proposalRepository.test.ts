/**
 * tests/unit/storage/proposalRepository.test.ts
 *
 * Runtime behavioral tests for PostgresProposalRepository, stubbing
 * PostgresClient directly. No existing precedent in this codebase tests
 * a concrete Postgres<Entity>Repository's SQL-generation logic against
 * a stubbed client (existing repository-interface tests use hand-written
 * I<Entity>Store stubs instead) -- this pattern is new, introduced here
 * because IProposalStore has no other test coverage.
 */

import { describe, it, expect, vi } from "vitest";
import { PostgresProposalRepository } from "../../../src/storage/PostgresProposalRepository.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { CandidateFingerprint } from "../../../src/core/models/CandidateIdentity.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";
import type { PostgresClient } from "../../../src/storage/PostgresClient.js";

function makeProposal(overrides: Partial<IdentityProposal> = {}): IdentityProposal {
  return {
    externalIds: {},
    name: "Ace Plumbers",
    normalizedName: "ace plumbers",
    address: {
      raw: "Lagos",
      street: null,
      city: "Lagos",
      state: null,
      postalCode: null,
      country: "Nigeria",
      countryCode: "NG",
    },
    geo: null,
    phone: null,
    normalizedPhone: null,
    website: null,
    categories: [],
    primaryCategory: null,
    rating: null,
    reviewCount: null,
    hours: null,
    priceLevel: null,
    services: null,
    sourceProvider: "google-maps",
    sourceUrl: null,
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as RunID,
    queryId: "query-1" as QueryID,
    candidateFingerprint: "fp-abc" as CandidateFingerprint,
    rawResultId: "11111111-1111-1111-1111-111111111111" as UUID,
    ...overrides,
  };
}

function makeStubClient(
  queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
): PostgresClient {
  return { query: vi.fn(queryImpl) } as unknown as PostgresClient;
}

describe("PostgresProposalRepository", () => {
  describe("save()", () => {
    it("inserts and returns a PersistedProposal with the DB-assigned id and revived Date fields", async () => {
      const proposal = makeProposal();
      const storedRow = {
        id: "22222222-2222-2222-2222-222222222222",
        proposal_body: proposal,
        created_at: new Date("2024-06-01T00:00:00Z"),
      };
      const db = makeStubClient(async (sql) => {
        expect(sql).toContain("INSERT INTO proposals");
        expect(sql).toContain("RETURNING id, proposal_body, created_at");
        return { rows: [storedRow] };
      });
      const repo = new PostgresProposalRepository(db);

      const result = await repo.save(proposal);

      expect(result.id).toBe(storedRow.id);
      expect(result.createdAt).toEqual(storedRow.created_at);
      expect(result.proposal.collectedAt).toBeInstanceOf(Date);
      expect(result.proposal.candidateFingerprint).toBe(proposal.candidateFingerprint);
      expect(result.proposal.rawResultId).toBe(proposal.rawResultId);
    });

    it("passes candidateFingerprint, runId, rawResultId, and the full serialized body as params", async () => {
      const proposal = makeProposal();
      let capturedParams: unknown[] | undefined;
      const db = makeStubClient(async (_sql, params) => {
        capturedParams = params;
        return {
          rows: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              proposal_body: proposal,
              created_at: new Date("2024-06-01T00:00:00Z"),
            },
          ],
        };
      });
      const repo = new PostgresProposalRepository(db);

      await repo.save(proposal);

      expect(capturedParams).toBeDefined();
      expect(capturedParams?.[0]).toBe(proposal.candidateFingerprint);
      expect(capturedParams?.[1]).toBe(proposal.runId);
      expect(capturedParams?.[2]).toBe(proposal.rawResultId);
      expect(JSON.parse(capturedParams?.[3] as string)).toMatchObject({
        candidateFingerprint: proposal.candidateFingerprint,
      });
    });
  });

  describe("fetchById()", () => {
    it("returns null when no row matches", async () => {
      const db = makeStubClient(async () => ({ rows: [] }));
      const repo = new PostgresProposalRepository(db);

      const result = await repo.fetchById("does-not-exist" as UUID);

      expect(result).toBeNull();
    });

    it("returns the PersistedProposal when a row matches", async () => {
      const proposal = makeProposal();
      const storedRow = {
        id: "22222222-2222-2222-2222-222222222222",
        proposal_body: proposal,
        created_at: new Date("2024-06-01T00:00:00Z"),
      };
      const db = makeStubClient(async (sql) => {
        expect(sql).toContain("FROM proposals");
        expect(sql).toContain("WHERE id = $1");
        return { rows: [storedRow] };
      });
      const repo = new PostgresProposalRepository(db);

      const result = await repo.fetchById(storedRow.id as UUID);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(storedRow.id);
    });
  });

  describe("listByCandidateFingerprint()", () => {
    it("returns an empty array when no proposals match", async () => {
      const db = makeStubClient(async () => ({ rows: [] }));
      const repo = new PostgresProposalRepository(db);

      const result = await repo.listByCandidateFingerprint("fp-none" as CandidateFingerprint);

      expect(result).toEqual([]);
    });

    it("maps every matching row, preserving the SQL-provided order", async () => {
      const proposalA = makeProposal();
      const proposalB = makeProposal({ name: "Bee Plumbers" });
      const rows = [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          proposal_body: proposalB,
          created_at: new Date("2024-06-02T00:00:00Z"),
        },
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          proposal_body: proposalA,
          created_at: new Date("2024-06-01T00:00:00Z"),
        },
      ];
      const db = makeStubClient(async (sql) => {
        expect(sql).toContain("WHERE candidate_fingerprint = $1");
        expect(sql).toContain("ORDER BY created_at DESC");
        return { rows };
      });
      const repo = new PostgresProposalRepository(db);

      const result = await repo.listByCandidateFingerprint(proposalA.candidateFingerprint);

      expect(result).toHaveLength(2);
      expect(result[0]?.proposal.name).toBe("Bee Plumbers");
      expect(result[1]?.proposal.name).toBe("Ace Plumbers");
    });
  });
});