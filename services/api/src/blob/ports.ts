/**
 * Where artefact bytes live.
 *
 * An evidence record says an artefact existed and what it hashed to. That is
 * enough to prove the record has not been edited, and not enough to answer the
 * only question a reader has next: "show me the file". Without somewhere to put
 * the bytes, a checksum is a claim about a file nobody can fetch.
 *
 * The port is deliberately small and content-addressed: a blob is named by its
 * SHA-256, so writing the same object twice is a no-op, and reading it back can
 * be checked against the name it was stored under. `get` returns `null` for
 * "never stored"; it must not throw for a missing object, because "the record
 * is old" is a normal state, not an outage.
 *
 * A storage outage is different and must throw (`StoreUnavailableError`), so the
 * HTTP layer can answer `503` instead of `404 no such artefact`.
 */

/**
 * Which implementation is in use; reported by `/health` and capabilities.
 *
 * One member today. Object storage would add `'s3'` here and a case in
 * `createBlobStore` — and, before either, a server to test `409` against.
 */
export type BlobBackend = 'filesystem';

/** What `put` returns, and what an evidence payload records. */
export interface BlobRef {
  /** Lower-case hex SHA-256 of exactly the bytes that were stored. */
  sha256: string;
  /** Length in bytes. */
  bytes: number;
  mediaType: string;
}

export interface BlobProbe {
  backend: BlobBackend;
  /** False means artefacts cannot be read or written right now. */
  ok: boolean;
  /** One sentence for `/health`. */
  detail: string;
}

export interface BlobStore {
  readonly backend: BlobBackend;
  /**
   * Store bytes and return their reference.
   *
   * Idempotent: storing the same content twice writes once. An existing object
   * with the same digest but different bytes is corruption, and must throw
   * rather than overwrite — the digest is the identity.
   */
  put(content: Uint8Array, mediaType: string): Promise<BlobRef>;
  /** The bytes, or `null` when nothing is stored under that digest. */
  get(sha256: string): Promise<Uint8Array | null>;
  probe(): Promise<BlobProbe>;
  close?(): Promise<void> | void;
}
