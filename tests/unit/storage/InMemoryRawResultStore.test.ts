/**
 * tests/unit/storage/InMemoryRawResultStore.test.ts
 *
 * No prior dedicated coverage existed for this class. Covers save()/fetch()
 * existing behavior, plus the new fetchById() capability and the
 * concrete-only getAssignedId() test/dev accessor introduced in Phase 4F.
 * getAssignedId() is keyed via the same identityKey() (runId, providerId,
 * providerResultId) save() and seenIdentities already use -- never by
 * providerResultId alone, since it is not unique on its own.
 */

import { describe, it, expect } from "vitest";
import { InMemoryRawResultStore } from "../../../src/storage/InMemoryRawResultStore.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { ResumeToken } from "../../../src/core/types/pagination.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";

const RESUME_TOKEN: ResumeToken = {
  strategy: "offset",
  pageRequest: { kind: "offset", page: 1, pageSize: 20 },
  createdAt: 1_000_000,
};

function makeResult(
  providerResultId: string,
  runId = "run-1" as RunID,
  providerId = "google-maps",
  rawPayload: Record<string, unknown> = { name: "Test Business" },
): ProviderResult {
  return {
    providerId,
    providerResultId,
    rawPayload,
    resumeToken: RESUME_TOKEN,
    sourceUrl: null,
    collectedAt: new Date("2025-01-01T00:00:00Z"),
    runId,
    queryId: "query-1" as QueryID,
  };
}

describe("InMemoryRawResultStore", () => {
  describe("existing save()/fetch() behavior", () => {
    it("save() returns true for a new identity", async () => {
      const store = new InMemoryRawResultStore();
      const isNew = await store.save(makeResult("place-1"));
      expect(isNew).toBe(true);
    });

    it("save() returns false for a duplicate identity (same run/provider/providerResultId)", async () => {
      const store = new InMemoryRawResultStore();
      await store.save(makeResult("place-1"));
      const isNew = await store.save(makeResult("place-1"));
      expect(isNew).toBe(false);
    });

    it("fetch() returns the saved result by providerResultId", async () => {
      const store = new InMemoryRawResultStore();
      await store.save(makeResult("place-1"));
      const result = await store.fetch("place-1");
      expect(result?.providerResultId).toBe("place-1");
    });

    it("fetch() returns null for an unknown providerResultId", async () => {
      const store = new InMemoryRawResultStore();
      const result = await store.fetch("missing");
      expect(result).toBeNull();
    });

    it("size reflects the number of stored results", async () => {
      const store = new InMemoryRawResultStore();
      await store.save(makeResult("place-1"));
      await store.save(makeResult("place-2"));
      expect(store.size).toBe(2);
    });
  });

  describe("UUID assignment and getAssignedId()", () => {
    it("assigns a UUID on a new-identity save()", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1");
      await store.save(result);
      const id = store.getAssignedId(result);
      expect(id).not.toBeNull();
      expect(typeof id).toBe("string");
    });

    it("getAssignedId() returns null for an identity never saved", () => {
      const store = new InMemoryRawResultStore();
      expect(store.getAssignedId(makeResult("never-saved"))).toBeNull();
    });

    it("does not reassign a UUID on a duplicate-identity save()", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1");
      await store.save(result);
      const firstId = store.getAssignedId(result);
      await store.save(result);
      const secondId = store.getAssignedId(result);
      expect(secondId).toBe(firstId);
    });

    it("assigns distinct UUIDs to different identities sharing the same providerResultId", async () => {
      const store = new InMemoryRawResultStore();
      const resultRunA = makeResult("shared-place-id", "run-a" as RunID);
      const resultRunB = makeResult("shared-place-id", "run-b" as RunID);

      await store.save(resultRunA);
      await store.save(resultRunB);

      const idA = store.getAssignedId(resultRunA);
      const idB = store.getAssignedId(resultRunB);

      expect(idA).not.toBeNull();
      expect(idB).not.toBeNull();
      expect(idA).not.toBe(idB);
    });
  });

  describe("fetchById()", () => {
    it("returns the saved result for its assigned UUID", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1");
      await store.save(result);
      const id = store.getAssignedId(result) as UUID;

      const fetched = await store.fetchById(id);

      expect(fetched).not.toBeNull();
      expect(fetched?.providerResultId).toBe("place-1");
    });

    it("returns null for an unknown UUID", async () => {
      const store = new InMemoryRawResultStore();
      const result = await store.fetchById(
        "00000000-0000-0000-0000-000000000000" as UUID,
      );
      expect(result).toBeNull();
    });

    it("resolves each identity to its own distinct result when providerResultId is shared across runs", async () => {
      const store = new InMemoryRawResultStore();
      const resultRunA = makeResult("shared-place-id", "run-a" as RunID);
      const resultRunB = makeResult("shared-place-id", "run-b" as RunID);
      await store.save(resultRunA);
      await store.save(resultRunB);

      const idA = store.getAssignedId(resultRunA) as UUID;
      const idB = store.getAssignedId(resultRunB) as UUID;

      const fetchedA = await store.fetchById(idA);
      const fetchedB = await store.fetchById(idB);

      expect(fetchedA?.runId).toBe("run-a");
      expect(fetchedB?.runId).toBe("run-b");
    });
  });

  describe("saveAndGetId()", () => {
    it("returns { id, isNew: true } for a new identity", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1");

      const outcome = await store.saveAndGetId(result);

      expect(outcome.isNew).toBe(true);
      expect(typeof outcome.id).toBe("string");
    });

    it("returns { id, isNew: false } for a duplicate identity", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1");
      await store.saveAndGetId(result);

      const outcome = await store.saveAndGetId(result);

      expect(outcome.isNew).toBe(false);
    });

    it("returns the same UUID for duplicate saves (no duplicate UUID generation)", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1");

      const first = await store.saveAndGetId(result);
      const second = await store.saveAndGetId(result);

      expect(second.id).toBe(first.id);
    });
  });

  describe("saveAndGetIdWithWebsiteFill()", () => {
    it("inserts normally for a new identity, returning isNew: true, updated: false", async () => {
      const store = new InMemoryRawResultStore();
      const result = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        website: "https://ace.example.com",
      });

      const outcome = await store.saveAndGetIdWithWebsiteFill(result, "https://ace.example.com");

      expect(outcome.isNew).toBe(true);
      expect(outcome.updated).toBe(false);
      expect(typeof outcome.id).toBe("string");
    });

    it("fills the website on a duplicate whose existing row has no website, returning updated: true", async () => {
      const store = new InMemoryRawResultStore();
      const original = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        phone: "+234 801 234 5678",
      });
      await store.saveAndGetId(original);

      const retry = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        website: "https://ace.example.com",
      });
      const outcome = await store.saveAndGetIdWithWebsiteFill(retry, "https://ace.example.com");

      expect(outcome.isNew).toBe(false);
      expect(outcome.updated).toBe(true);
    });

    it("preserves all pre-existing fields when filling the website", async () => {
      const store = new InMemoryRawResultStore();
      const original = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        phone: "+234 801 234 5678",
        rating: 4.5,
        hoursRaw: ["Mon-Fri: 09:00-17:00"],
      });
      await store.saveAndGetId(original);

      const retry = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        website: "https://ace.example.com",
      });
      const outcome = await store.saveAndGetIdWithWebsiteFill(retry, "https://ace.example.com");

      const stored = await store.fetchById(outcome.id);
      const payload = stored?.rawPayload as Record<string, unknown>;

      expect(payload.name).toBe("Ace Plumbers");
      expect(payload.phone).toBe("+234 801 234 5678");
      expect(payload.rating).toBe(4.5);
      expect(payload.hoursRaw).toEqual(["Mon-Fri: 09:00-17:00"]);
      expect(payload.website).toBe("https://ace.example.com");
    });

    it("does not overwrite an existing non-empty website, returning updated: false", async () => {
      const store = new InMemoryRawResultStore();
      const original = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        website: "https://original.example.com",
      });
      await store.saveAndGetId(original);

      const retry = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
        website: "https://different.example.com",
      });
      const outcome = await store.saveAndGetIdWithWebsiteFill(retry, "https://different.example.com");

      expect(outcome.isNew).toBe(false);
      expect(outcome.updated).toBe(false);

      const stored = await store.fetchById(outcome.id);
      const payload = stored?.rawPayload as Record<string, unknown>;
      expect(payload.website).toBe("https://original.example.com");
    });

    it("repeating the same fill is idempotent -- second call returns updated: false", async () => {
      const store = new InMemoryRawResultStore();
      const original = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
      });
      await store.saveAndGetId(original);

      const retry = makeResult("place-1", "run-1" as RunID, "google-maps", {
        website: "https://ace.example.com",
      });
      const first = await store.saveAndGetIdWithWebsiteFill(retry, "https://ace.example.com");
      expect(first.updated).toBe(true);

      const second = await store.saveAndGetIdWithWebsiteFill(retry, "https://ace.example.com");
      expect(second.updated).toBe(false);
    });

    it("returns the same id as the original identity across the fill", async () => {
      const store = new InMemoryRawResultStore();
      const original = makeResult("place-1", "run-1" as RunID, "google-maps", {
        name: "Ace Plumbers",
      });
      const originalOutcome = await store.saveAndGetId(original);

      const retry = makeResult("place-1", "run-1" as RunID, "google-maps", {
        website: "https://ace.example.com",
      });
      const fillOutcome = await store.saveAndGetIdWithWebsiteFill(retry, "https://ace.example.com");

      expect(fillOutcome.id).toBe(originalOutcome.id);
    });
  });
});