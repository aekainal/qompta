# VAT logic: FTA/ESTV VAT return

## 1. VAT return codes

The labels below are translations. The official FTA form exists only in French,
German and Italian, and Qompta displays the French wording: an invoice's VAT
treatment reads `Exonérée / export (220)` or `Exclue art. 21 (230)` in the user
interface. **The numeric codes are the stable key**: they are identical across all
language versions of the form, and they are what the code, the exports and this
document all join on. Article references point to the Swiss VAT Act (LTVA/MWSTG).

### I. Considerations (turnover)
| Code | Label | Column |
|---|---|---|
| 200 | Total agreed/received considerations (worldwide turnover) | Prestations |
| 205 | Share of line 200: excluded supplies opted for taxation (art. 22) | Prestations |

### II. Deductions
| Code | Label |
|---|---|
| 220 | Supplies exempt from the tax (exports art. 23; art. 107 para. 1 let. a) |
| 221 | Supplies provided abroad (place of supply abroad) |
| 225 | Transfers under the notification procedure (art. 38) |
| 230 | Supplies excluded from the tax (art. 21) in Switzerland, without option under art. 22 |
| 235 | Reductions of the consideration (rebates, discounts) |
| 280 | Miscellaneous (e.g. land value) |
| **289** | **Total deductions** = 220+221+225+230+235+280 |
| **299** | **Taxable turnover** = 200 − 289 |

### Tax computation
| Code | Label | 2026 rate |
|---|---|---|
| 303 | Supplies at the standard rate | 8.10 % |
| 313 | Supplies at the reduced rate | 2.60 % |
| 343 | Supplies at the special accommodation rate | 3.80 % |
| 379 | Total taxable turnover (= must match 299) | - |
| 383 | Acquisition tax (net, excluding VAT) | - |
| **399** | **Total tax due** = tax(303)+tax(313)+tax(343)+383 |

### Input tax
| Code | Label |
|---|---|
| 400 | Input tax on material and service costs |
| 405 | Input tax on investments and other operating expenses |
| 410 | Subsequent input tax deduction (art. 32) |
| 415 | Corrections: mixed use (art. 30), own use (art. 31) |
| 420 | Reduction of the deduction (subsidies, tourist taxes, art. 33 para. 2) |
| **479** | **Total input tax** = 400+405+410 − 415 − 420 |

### Balance
| Code | Label |
|---|---|
| 500 | Amount payable (if 399 − 479 > 0) |
| 510 | Balance in favour of the VAT-registered person (if 399 − 479 ≤ 0) |

### III. Other cash flows (art. 18 para. 2): informational, outside the balance computation
| Code | Label |
|---|---|
| 900 | Subsidies, tourist taxes, waste/water disposal contributions |
| 910 | Donations, dividends, compensation, etc. |

---

## 2. Exact formulas (to be implemented in `shared/vat/compute.ts`)

```ts
// Bases (« Prestations CHF » column), all in cents
b289 = b220 + b221 + b225 + b230 + b235 + b280
b299 = b200 - b289
b379 = b303 + b313 + b343          // taxable base broken down by rate

// Consistency: warning if b379 !== b299 (not a blocker)
coherenceWarning = (b379 !== b299)

// Taxes (« Impôt CHF » column)
tax303 = round(b303 * 810 / 10000)   // standard rate 8.10 %
tax313 = round(b313 * 260 / 10000)   // reduced rate 2.60 %
tax343 = round(b343 * 380 / 10000)   // accommodation 3.80 %
b399   = tax303 + tax313 + tax343 + tax383   // tax383 = acquisition tax

// Input tax
b479 = b400 + b405 + b410 - b415 - b420

// Balance
solde = b399 - b479
if (solde > 0)  { code500 = solde;  code510 = 0 }
else            { code510 = -solde; code500 = 0 }
```

The `round()` rounding follows the FTA rule (commercial rounding to the cent). The rates are
read from `vat_rate_defaults`/`company_vat_rates` at the **date of the period**, never
hard-coded, so that past periods are preserved.

---

## 3. Invoice → code mapping (default rules, overridable)

| Invoice case | Turnover base | Tax / input tax code |
|---|---|---|
| Sale, standard rate | 200 + 299 | 303 |
| Sale, reduced rate | 200 + 299 | 313 |
| Sale, accommodation | 200 + 299 | 343 |
| Exempt sale (export, art. 23) | 200 then 220 | - |
| Supply abroad | 200 then 221 | - |
| Excluded supply (art. 21, without option) | 200 then 230 | - |
| Rebate / discount granted | - | 235 (reduction) |
| Purchase of materials / services | - | 400 |
| Purchase of investment / operating expense | - | 405 |
| Subsidy / tourist tax received | - | 900 (+ impact on 420) |
| Donation / dividend received | - | 910 |

- The **default code** comes from `account_categories.default_vat_code`, adjusted by the
  VAT rate and the type (sale/purchase).
- The user can **force** a code per invoice (`vat_code_override = true`).
- A taxed sale **always** feeds 200 (worldwide turnover); exempt / foreign /
  excluded sales additionally feed the matching deduction (220/221/230) so
  that 299 only retains the turnover that is actually taxable.

---

## 4. Time allocation basis (accrual vs cash)

- `company_vat_settings.accounting_basis`:
  - `agreed` (accrual basis, **default**) → the invoice falls in the period of its
    `issue_date`.
  - `received` (cash basis) → the invoice falls in the period of its `payment_date`
    (partial payments count at their respective dates).
- Selecting "company + period" → invoices are filtered on that basis, the mapping is
  applied, amounts are aggregated per code, and 289/299/379/399/479/500/510 are computed.

### Drafts never enter the VAT return

An invoice with status `draft` is **excluded whatever the basis**. On the accrual
basis VAT is due on issue: as long as the invoice is not issued, it
creates no liability. This rule has been indispensable since quotes arrived: their
conversion produces a draft invoice, which must not inflate the VAT return
before it has actually been sent to the customer.

`selectPeriodInvoices` (shared/vat/buildReturn.ts) applies that filter; it is
covered by `tests/quotes-repo.test.ts`.

### Quotes are outside the VAT return by design

A quote is not an accounting operation. It lives in its own `quotes` table,
never read by the VAT module: no VAT return query can therefore see it.
It is its conversion that creates a sales invoice, which then follows the normal path.
A quote mixing several rates produces **one invoice per rate**, otherwise the
303/313/343 breakdown would be wrong.

---

## 5. TDFN method (net tax debt rate)

- With the `tdfn` method, the tax due is computed by applying the **FTA flat rate**
  (`tdfn_rates`) to the gross taxable turnover, **without any input tax deduction**
  (codes 400/405 hidden). The display of the codes adapts (simplified TDFN form).
- The method is frozen on each closed VAT return.

---

## 6. Mandatory test cases (Vitest)

1. Single sale of CHF 1000.00 net @ 8.10 % → 200=100000, 299=100000, 303=100000,
   tax303=8100, 399=8100, 479=0, 500=8100.
2. Mix of standard + reduced + accommodation rates → check 379 = sum of the bases, and 399.
3. Export (220) + standard sale → 299 excludes the export; 379 = 299.
4. Purchases 400/405 greater than the tax due → 510 (credit) positive.
5. Discrepancy 379 ≠ 299 → `coherenceWarning = true`.
6. Gross vs net entry yields the same bases after conversion.
7. Company not VAT-registered → no VAT return generated.
8. TDFN method → 400/405 ignored, tax = gross turnover × flat rate.
9. Rounding: 2.60 % of 333.35 → check the exact cent.
10. Quarterly period: only invoices in the period are aggregated.
