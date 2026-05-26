/**
 * @module core/interfaces/INormalizer
 *
 * Normalizer contracts — ProviderResult → BusinessRecord.
 *
 * The normalizer is stateless: given the same ProviderResult, it must
 * always produce the same BusinessRecord. No DB reads, no queue calls.
 *
 * Architecture:
 *   BusinessNormalizer          orchestrates field normalizers
 *   ├── IFieldNormalizer<Phone> normalizes phone strings → E164Phone
 *   ├── IFieldNormalizer<Address> normalizes address strings → Address
 *   ├── IFieldNormalizer<Hours>  parses hours strings → BusinessHours
 *   └── IProviderMapper          maps provider-specific keys → PartialRawFields
 */
export {};
//# sourceMappingURL=INormalizer.js.map