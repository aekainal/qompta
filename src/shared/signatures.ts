/**
 * Handwritten signatures of the people who sign for the company (shareholders).
 * PURE module: types and checks, shared main ↔ renderer.
 */

export interface Signature {
  id: string;
  companyId: string;
  /** Shareholder who signs; null if they have been deleted since. */
  associateId: string | null;
  /** Name printed under the signature. */
  name: string;
  /** Title printed under the name (« Associé gérant »…). */
  role: string | null;
  /** Signature image, as a data-URI. */
  image: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureInput {
  associateId?: string | null;
  name: string;
  role?: string | null;
  image: string;
  isDefault?: boolean;
}

/** Maximum weight of a signature image (it is copied into every PDF). */
export const SIGNATURE_MAX_BYTES = 1_500_000;

const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/**
 * Accepts only an image data-URI: the value goes as is into the printed HTML,
 * nothing else (script, remote URL) must be able to slip in there.
 */
export function safeSignatureImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > SIGNATURE_MAX_BYTES * 1.4) return null;
  return IMAGE_RE.test(value) ? value : null;
}

/**
 * Signature to print: the requested one if it still exists, otherwise the
 * default one, otherwise the first. `null` when the company has none.
 */
export function pickSignature(list: Signature[], wantedId?: string | null): Signature | null {
  return (
    (wantedId ? list.find((s) => s.id === wantedId) : undefined) ??
    list.find((s) => s.isDefault) ??
    list[0] ??
    null
  );
}
