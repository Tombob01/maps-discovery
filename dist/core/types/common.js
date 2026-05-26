/**
 * @module core/types/common
 * Primitive value types shared across all modules.
 * No logic. No imports from sibling modules.
 */
export function ok(value) {
    return { ok: true, value };
}
export function err(error) {
    return { ok: false, error };
}
export function isOk(r) {
    return r.ok;
}
export function isErr(r) {
    return !r.ok;
}
export const NONE = { some: false };
export function some(value) {
    return { some: true, value };
}
export function isSome(o) {
    return o.some;
}
export function isNone(o) {
    return !o.some;
}
//# sourceMappingURL=common.js.map