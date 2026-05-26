/**
 * @module core/types/pagination
 * Provider-agnostic pagination primitives.
 *
 * Supports three pagination strategies:
 *   1. Offset/page-number  — classic page=N&size=M
 *   2. Cursor              — opaque string from last response
 *   3. URL                 — next-page URL embedded in response
 *
 * All strategies are expressed through a single discriminated union so
 * consumers can handle any provider without conditional branching.
 */
export {};
//# sourceMappingURL=pagination.js.map