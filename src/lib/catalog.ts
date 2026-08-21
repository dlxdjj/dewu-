import type { DbAdapter } from "@/lib/data/types";
import type { Attachment, Product } from "@/lib/types/database";
import { cachedProductImageUrl } from "@/lib/product-image-cache";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function normalizeStyleCode(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
    .toLocaleUpperCase();
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
  db: Pick<
    DbAdapter,
    | "listAttachments"
    | "listAttachmentsByOwnerIds"
    | "attachmentUrl"
    | "listCatalogProducts"
    | "catalogImageUrl"
  >,
  products: Iterable<Product>,
  onResolved?: (productId: string, url: string) => void,
): Promise<Map<string, string>> {
  const wanted = [...products];
  if (!wanted.length) return new Map();
  const productIds = wanted.map((product) => product.id);
  const [attachments, catalogs] = await Promise.all([
    db.listAttachmentsByOwnerIds
      ? db.listAttachmentsByOwnerIds("product", productIds)
      : db.listAttachments("product"),
    db.listCatalogProducts().catch(() => []),
  ]);
  const latest = latestProductImageByOwner(attachments);
  const catalogMap = new Map(catalogs.map((catalog) => [catalog.id, catalog]));
  const pairs = await Promise.all(
    wanted.map(async (product) => {
      const attachment = latest.get(product.id);
      try {
        const catalog = product.catalog_product_id
          ? catalogMap.get(product.catalog_product_id)
          : undefined;
        const path = attachment?.path ?? catalog?.image_path;
        if (!path) return null;
        const localUrl = await cachedProductImageUrl(path);
        if (localUrl) {
          onResolved?.(product.id, localUrl);
          return [product.id, localUrl] as const;
        }
        const cached = signedUrlCache.get(path);
        if (cached && cached.expiresAt > Date.now()) {
          onResolved?.(product.id, cached.url);
          return [product.id, cached.url] as const;
        }
        const url = attachment
          ? await db.attachmentUrl(attachment)
          : await db.catalogImageUrl(catalog!);
        signedUrlCache.set(path, {
          url,
          expiresAt: Date.now() + 12 * 60_000,
        });
        onResolved?.(product.id, url);
        return [product.id, url] as const;
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
