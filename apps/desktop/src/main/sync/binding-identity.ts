/**
 * [INPUT]: Main/worker binding identity values.
 * [OUTPUT]: Strict complete account/project/cloud/local/device/key/token guard.
 * [POS]: Internal binding DTO; no credential or filesystem dependency.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export { provenanceBindingSchema as bindingIdentitySchema } from '../../shared/contracts/provenance'
