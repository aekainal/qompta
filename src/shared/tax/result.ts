/**
 * Income statement (common ground for every legal form).
 * Pure function — aggregates income/expenses from the invoices of a financial year.
 */

import { sumCents, type Cents } from "../money.js";

export interface ResultLine {
  categoryId: string | null;
  categoryLabel: string;
  kind: "product" | "expense";
  amount: Cents; // net amount in CHF
}

export interface IncomeStatement {
  totalProducts: Cents;
  totalExpenses: Cents;
  /** Profit (> 0) or loss (< 0). */
  result: Cents;
  productsByCategory: ResultLine[];
  expensesByCategory: ResultLine[];
}

/**
 * Builds the income statement from categorized lines.
 */
export function buildIncomeStatement(lines: ResultLine[]): IncomeStatement {
  const products = lines.filter((l) => l.kind === "product");
  const expenses = lines.filter((l) => l.kind === "expense");
  const totalProducts = sumCents(...products.map((l) => l.amount));
  const totalExpenses = sumCents(...expenses.map((l) => l.amount));
  return {
    totalProducts,
    totalExpenses,
    result: totalProducts - totalExpenses,
    productsByCategory: products,
    expensesByCategory: expenses,
  };
}
