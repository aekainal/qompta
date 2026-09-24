/**
 * Commercial view of the quotes on the dashboard.
 *
 * Core rule: a refused or expired quote is a lost deal only if it has not been
 * taken over. When the offer is adapted, the new version is the one carrying
 * the opportunity — counting both would inflate the losses artificially.
 */

import { describe, expect, it } from "vitest";
import { buildQuotePipeline, type DashQuote } from "../src/shared/dashboard.js";

const q = (
  id: string,
  status: string,
  amountHt: number,
  supersededByQuoteId: string | null = null,
  issueDate = "2026-05-12",
): DashQuote => ({ id, issueDate, status, amountHt, supersededByQuoteId });

describe("devis — potentiel, gagné, perdu", () => {
  it("compte les devis en cours comme chiffre d'affaires encore possible", () => {
    const p = buildQuotePipeline([q("1", "draft", 50000), q("2", "sent", 30000)], 2026);
    expect(p.pending).toBe(80000);
    expect(p.pendingCount).toBe(2);
  });

  it("sépare les devis acceptés des devis déjà facturés", () => {
    const p = buildQuotePipeline([q("1", "accepted", 20000), q("2", "invoiced", 60000)], 2026);
    expect(p.accepted).toBe(20000);
    expect(p.won).toBe(60000);
    expect(p.acceptedCount).toBe(1);
    expect(p.wonCount).toBe(1);
  });

  it("compte comme perdus les devis refusés ou expirés non repris", () => {
    const p = buildQuotePipeline([q("1", "refused", 40000), q("2", "expired", 10000)], 2026);
    expect(p.lost).toBe(50000);
    expect(p.lostCount).toBe(2);
    expect(p.revised).toBe(0);
  });

  it("ne compte PAS comme perdu un devis refusé puis adapté", () => {
    const p = buildQuotePipeline(
      [q("1", "refused", 40000, "2"), q("2", "sent", 35000)],
      2026,
    );
    expect(p.lost).toBe(0);
    expect(p.lostCount).toBe(0);
    expect(p.revised).toBe(40000);
    expect(p.revisedCount).toBe(1);
    // The adapted version takes its place back in the pipeline.
    expect(p.pending).toBe(35000);
  });

  it("calcule le taux de transformation sur les seules affaires tranchées", () => {
    const p = buildQuotePipeline(
      [
        q("1", "invoiced", 75000),
        q("2", "refused", 25000),
        q("3", "sent", 90000), // pending: not part of the calculation
      ],
      2026,
    );
    // 75 000 won out of 100 000 decided -> 75 %
    expect(p.winRateBps).toBe(7500);
  });

  it("exclut du taux les devis adaptés, qui ne sont pas des échecs", () => {
    const p = buildQuotePipeline(
      [q("1", "invoiced", 50000), q("2", "refused", 50000, "3"), q("3", "accepted", 55000)],
      2026,
    );
    // Only the invoiced quote is decided: 100 %.
    expect(p.winRateBps).toBe(10000);
  });

  it("renvoie un taux nul quand rien n'est tranché", () => {
    expect(buildQuotePipeline([q("1", "sent", 10000)], 2026).winRateBps).toBe(0);
  });

  it("ne retient que les devis de l'année demandée", () => {
    const p = buildQuotePipeline(
      [q("1", "sent", 10000, null, "2025-11-03"), q("2", "sent", 20000, null, "2026-01-09")],
      2026,
    );
    expect(p.pending).toBe(20000);
  });
});
