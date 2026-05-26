/**
 * @module core/models/ProviderResult
 *
 * Raw result shape produced by a provider before any normalisation.
 *
 * The Normalizer reads ProviderResult and writes BusinessRecord.
 * Providers write ProviderResult and know nothing about BusinessRecord.
 *
 * Rules:
 *   • rawPayload is completely unmodified provider output.
 *   • No normalised fields live here — that is the Normalizer's job.
 *   • resumeToken must be persisted in the job payload for restartability.
 */
export {};
//# sourceMappingURL=ProviderResult.js.map