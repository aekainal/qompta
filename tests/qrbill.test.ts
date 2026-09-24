import { describe, expect, it } from "vitest";
import {
  buildQrBillData,
  buildQrReference,
  buildScorReference,
  normalizeIban,
  validateQrBill,
  type QrBillSource,
} from "../src/shared/documents/qrbill.js";
import { isQRReferenceValid, isSCORReferenceValid } from "swissqrbill/utils";

/** Real Qwasar IBAN (not a QR-IBAN). */
const IBAN = "CH39 0022 6226 1673 7740 Q";
/** Test QR-IBAN taken from the documentation of the standard. */
const QR_IBAN = "CH44 3199 9123 0008 8901 2";

const creditor = {
  name: "Qwasar Gerber RI",
  street: "Rue Chautenatte",
  buildingNumber: "19",
  zip: "2720",
  city: "Tramelan",
  country: "CH",
};

const debtor = {
  name: "YASURAGI",
  street: "Rue Albert-Gobat",
  buildingNumber: "2",
  zip: "2720",
  city: "Tramelan",
  country: "CH",
};

const base: QrBillSource = {
  iban: IBAN,
  creditor,
  debtor,
  amountTtc: 58915,
  currency: "CHF",
  message: "Facture FC2026072201",
};

describe("QR-facture suisse", () => {
  it("normalise l'IBAN saisi avec des espaces", () => {
    expect(normalizeIban(IBAN)).toBe("CH390022622616737740Q");
  });

  it("accepte les données du cas réel Qwasar", () => {
    expect(validateQrBill(base)).toEqual([]);
  });

  it("convertit le montant en centimes vers des francs", () => {
    const data = buildQrBillData(base);
    expect(data.amount).toBe(589.15);
    expect(data.creditor.account).toBe("CH390022622616737740Q");
    expect(data.debtor?.name).toBe("YASURAGI");
  });

  it("signale un IBAN invalide", () => {
    expect(validateQrBill({ ...base, iban: "CH00 0000 0000 0000 0000 0" })).toContainEqual(
      expect.stringMatching(/IBAN invalide/),
    );
  });

  it("signale l'absence de compte bancaire", () => {
    expect(validateQrBill({ ...base, iban: "" })).toContainEqual(
      expect.stringMatching(/Aucun compte bancaire/),
    );
  });

  it("exige une adresse de société exploitable", () => {
    const errors = validateQrBill({ ...base, creditor: { ...creditor, city: null } });
    expect(errors).toContainEqual(expect.stringMatching(/adresse de la société est incomplète/));
  });

  it("dérive automatiquement une référence QR quand l'IBAN est un QR-IBAN", () => {
    const data = buildQrBillData({ ...base, iban: QR_IBAN });
    expect(data.reference).toBeDefined();
    expect(isQRReferenceValid(data.reference!)).toBe(true);
  });

  it("n'ajoute aucune référence sur un IBAN classique", () => {
    expect(buildQrBillData(base).reference).toBeUndefined();
  });

  it("calcule des références QR et SCOR valides", () => {
    expect(isQRReferenceValid(buildQrReference("FC2026072201"))).toBe(true);
    expect(isSCORReferenceValid(buildScorReference("FC2026072201"))).toBe(true);
  });

  it("refuse une devise hors CHF/EUR", () => {
    expect(validateQrBill({ ...base, currency: "USD" })).toContainEqual(
      expect.stringMatching(/CHF ou EUR/),
    );
  });

  it("tronque la communication à 140 caractères", () => {
    const data = buildQrBillData({ ...base, message: "x".repeat(200) });
    expect(data.message).toHaveLength(140);
  });

  it("échoue explicitement sur des données inexploitables", () => {
    expect(() => buildQrBillData({ ...base, iban: "n'importe quoi" })).toThrow(/IBAN invalide/);
  });
});
