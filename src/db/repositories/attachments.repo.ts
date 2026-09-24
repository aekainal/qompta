/**
 * Invoice attachments repository, filtered by company_id.
 * "Link" mode: the absolute path of the original file is stored (no copy).
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { invoiceAttachments } from "../schema.js";
import type { InvoiceAttachment } from "../../shared/types.js";

function rowTo(row: typeof invoiceAttachments.$inferSelect): InvoiceAttachment {
  return {
    id: row.id,
    companyId: row.companyId,
    invoiceId: row.invoiceId,
    filePath: row.filePath,
    originalName: row.originalName,
    mime: row.mime,
    size: row.size,
    hash: row.hash,
  };
}

export function createAttachmentsRepo(db: DB) {
  return {
    list(companyId: string, invoiceId: string): InvoiceAttachment[] {
      return db
        .select()
        .from(invoiceAttachments)
        .where(
          and(
            eq(invoiceAttachments.companyId, companyId),
            eq(invoiceAttachments.invoiceId, invoiceId),
          ),
        )
        .all()
        .map(rowTo);
    },

    add(
      companyId: string,
      invoiceId: string,
      file: { filePath: string; originalName: string; mime?: string | null; size?: number | null },
    ): InvoiceAttachment {
      const id = randomUUID();
      db.insert(invoiceAttachments)
        .values({
          id,
          companyId,
          invoiceId,
          filePath: file.filePath,
          originalName: file.originalName,
          mime: file.mime ?? null,
          size: file.size ?? null,
        })
        .run();
      return rowTo(
        db.select().from(invoiceAttachments).where(eq(invoiceAttachments.id, id)).get()!,
      );
    },

    remove(companyId: string, id: string): { ok: true } {
      db.delete(invoiceAttachments)
        .where(and(eq(invoiceAttachments.companyId, companyId), eq(invoiceAttachments.id, id)))
        .run();
      return { ok: true };
    },
  };
}

export type AttachmentsRepo = ReturnType<typeof createAttachmentsRepo>;
