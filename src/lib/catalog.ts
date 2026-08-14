import type { DbAdapter } from "@/lib/data/types";
import type { Attachment, Product } from "@/lib/types/database";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function normalizeStyleCode(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function findProductByStyleCode(
  products: Product[],
  value: string,
): Product | undefined {
  const normalized = normalizeStyleCode(value);
  if (!normalized) return undefined;
  return products.find(
    (product) => normalizeStyleCode(product.style_code) === normalized,
  );
}

export function latestProductImageByOwner(
  attachments: Attachment[],
): Map<string, Attachment> {
  const result = new Map<string, Attachment>();
  for (const attachment of attachments) {
    if (
      attachment.owner_type !== "product" ||
      attachment.kind !== "product_image"
    ) {
      continue;
    }
    const current = result.get(attachment.owner_id);
    if (
      !current ||
      `${attachment.created_at}|${attachment.id}` >
        `${current.created_at}|${current.id}`
    ) {
      result.set(attachment.owner_id, attachment);
    }
  }
  return result;
}

export async function loadProductImageUrls(
  db: Pick<DbAdapter, "listAttachments" | "attachmentUrl">,
  productIds: Iterable<string>,
): Promise<Map<string, string>> {
  const wanted = new Set(productIds);
  if (!wanted.size) return new Map();
  const latest = latestProductImageByOwner(await db.listAttachments("product"));
  const pairs = await Promise.all(
    [...wanted].map(async (productId) => {
      const attachment = latest.get(productId);
      if (!attachment) return null;
      try {
        const cached = signedUrlCache.get(attachment.path);
        if (cached && cached.expiresAt > Date.now()) {
          return [productId, cached.url] as const;
        }
        const url = await db.attachmentUrl(attachment);
        signedUrlCache.set(attachment.path, {
          url,
          expiresAt: Date.now() + 12 * 60_000,
        });
        return [productId, url] as const;
      } catch {
        return null;
      }
    }),
  );
  return new Map(
    pairs.filter(
      (pair): pair is readonly [string, string] => pair !== null,
    ),
  );
}
