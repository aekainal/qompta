/**
 * Preparation and validation of the Swiss QR payment part data.
 *
 * PURE module (no Electron/DB dependency): `swissqrbill/utils` only contains
 * validation and formatting functions. The SVG rendering itself stays on the
 * main side (see `src/main/export/pdf/`).
 *
 * Rules of the standard applied here:
 *  - a **QR-IBAN** requires a **QR reference** (27 digits, last = check digit);
 *  - a regular IBAN accepts a Creditor Reference (SCOR) or none;
 *  - the debtor is optional, but if provided it must be complete.
 */

import {
  calculateQRReferenceChecksum,
  calculateSCORReferenceChecksum,
  isIBANValid,
  isQRIBAN,
  isQRReferenceValid,
  isSCORReferenceValid,
} from "swissqrbill/utils";
import { centsToChf, type Cents } from "../money.js";

/** Structured address as required by the QR standard. */
export interface QrAddress {
  name: string;
  street: string | null;
  buildingNumber: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
}

export interface QrBillSource {
  iban: string;
  creditor: QrAddress;
  debtor?: QrAddress | null;
  amountTtc: Cents;
  currency: string;
  /** Free-form message (max 140 characters). */
  message?: string | null;
  /** Structured reference; generated automatically if the IBAN is a QR-IBAN. */
  reference?: string | null;
}

/** Address in the format expected by swissqrbill. */
export interface QrParty {
  name: string;
  address: string;
  buildingNumber: string;
  zip: string;
  city: string;
  country: string;
}

/** Data ready for `new SwissQRBill(...)`. */
export interface QrBillData {
  currency: "CHF" | "EUR";
  amount: number;
  creditor: QrParty & { account: string };
  debtor?: QrParty;
  message?: string;
  reference?: string;
}

/** Normalizes an IBAN: no spaces, uppercase. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Computes the QR reference (27 digits) from a free numeric base — typically
 * the invoice number reduced to its digits.
 */
export function buildQrReference(base: string): string {
  const digits = base.replace(/\D/g, "").slice(-26).padStart(26, "0");
  return digits + calculateQRReferenceChecksum(digits);
}

/** Computes a Creditor Reference (SCOR, ISO 11649). */
export function buildScorReference(base: string): string {
  const ref = base.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 21);
  return `RF${calculateSCORReferenceChecksum(ref)}${ref}`;
}

/** Is an address usable for the QR-bill? */
function addressComplete(a: QrAddress | null | undefined): a is QrAddress {
  return !!a && !!a.name && !!a.zip && !!a.city;
}

/**
 * Checks that the data allows issuing a QR-bill.
 * Returns the list of problems; empty if everything is correct.
 */
export function validateQrBill(src: QrBillSource): string[] {
  const errors: string[] = [];
  const iban = normalizeIban(src.iban ?? "");

  if (!iban) {
    errors.push("Aucun compte bancaire n'est rattaché à la facture.");
  } else if (!isIBANValid(iban)) {
    errors.push(`IBAN invalide : ${src.iban}.`);
  }

  if (!addressComplete(src.creditor)) {
    errors.push(
      "L'adresse de la société est incomplète (nom, NPA et localité sont requis sur la QR-facture).",
    );
  }
  if (src.debtor && !addressComplete(src.debtor)) {
    errors.push("L'adresse du client est incomplète (nom, NPA et localité sont requis).");
  }

  if (src.amountTtc < 0) {
    errors.push("Le montant de la QR-facture ne peut pas être négatif.");
  }

  if (src.currency !== "CHF" && src.currency !== "EUR") {
    errors.push(`La QR-facture n'accepte que CHF ou EUR (reçu : ${src.currency}).`);
  }

  if (iban && isIBANValid(iban)) {
    if (isQRIBAN(iban)) {
      if (!src.reference) {
        errors.push("Un QR-IBAN impose une référence QR ; aucune n'a pu être calculée.");
      } else if (!isQRReferenceValid(src.reference)) {
        errors.push(`Référence QR invalide : ${src.reference}.`);
      }
    } else if (src.reference && !isSCORReferenceValid(src.reference)) {
      errors.push(`Référence Creditor Reference (SCOR) invalide : ${src.reference}.`);
    }
  }

  return errors;
}

function toQrAddress(a: QrAddress): QrParty {
  return {
    name: a.name,
    address: a.street ?? "",
    buildingNumber: a.buildingNumber ?? "",
    zip: a.zip ?? "",
    city: a.city ?? "",
    country: (a.country || "CH").toUpperCase().slice(0, 2),
  };
}

/**
 * Builds the QR-bill data, deriving the reference when the IBAN requires it.
 * Throws if the data is unusable (see `validateQrBill`).
 */
export function buildQrBillData(src: QrBillSource): QrBillData {
  const iban = normalizeIban(src.iban ?? "");

  // A QR-IBAN with no explicit reference: derive it from the document number.
  let reference = src.reference ?? undefined;
  if (!reference && iban && isIBANValid(iban) && isQRIBAN(iban) && src.message) {
    reference = buildQrReference(src.message);
  }

  const errors = validateQrBill({ ...src, reference });
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const data: QrBillData = {
    currency: src.currency as "CHF" | "EUR",
    amount: centsToChf(src.amountTtc),
    creditor: { account: iban, ...toQrAddress(src.creditor) },
  };
  if (src.debtor) data.debtor = toQrAddress(src.debtor);
  if (reference) data.reference = reference;
  // The message is limited to 140 characters by the standard.
  if (src.message) data.message = src.message.slice(0, 140);

  return data;
}
