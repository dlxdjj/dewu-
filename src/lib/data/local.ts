// 本地实现：localStorage 存结构化数据，IndexedDB 存图片 Blob
// 真实持久化（刷新不丢），供未配置 Supabase 时使用
import type {
  Attachment,
  InventoryUnit,
  Product,
  PurchaseBatch,
  Sale,
  StatusHistory,
} from "@/lib/types/database";
import type {
  DbAdapter,
  NewBatch,
  NewHistory,
  NewProduct,
  NewSale,
  NewUnit,
  SaveAttachmentInput,
} from "./types";

const KEYS = {
  products: "pms_products",
  batches: "pms_batches",
  units: "pms_units",
  sales: "pms_sales",
  history: "pms_history",
  attachments: "pms_attachments",
} as const;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, rows: T[]): void {
  window.localStorage.setItem(key, JSON.stringify(rows));
}

function now(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

// ---------- IndexedDB（图片） ----------
const IDB_NAME = "dewu-pms";
const IDB_STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idbPut(key: string, blob: Blob): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<Blob | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Adapter ----------
export function createLocalAdapter(): DbAdapter {
  return {
    kind: "local",

    async listProducts() {
      return read<Product>(KEYS.products);
    },
    async createProduct(input: NewProduct) {
      const rows = read<Product>(KEYS.products);
      const row: Product = { id: uuid(), ...input, created_at: now(), updated_at: now() };
      write(KEYS.products, [...rows, row]);
      return row;
    },
    async updateProduct(id, patch) {
      const rows = read<Product>(KEYS.products);
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("商品不存在");
      rows[i] = { ...rows[i], ...patch, updated_at: now() };
      write(KEYS.products, rows);
      return rows[i];
    },

    async listBatches() {
      return read<PurchaseBatch>(KEYS.batches);
    },
    async createBatch(input: NewBatch) {
      const rows = read<PurchaseBatch>(KEYS.batches);
      const row: PurchaseBatch = { id: uuid(), ...input, created_at: now(), updated_at: now() };
      write(KEYS.batches, [...rows, row]);
      return row;
    },

    async listUnits() {
      const rows = read<InventoryUnit>(KEYS.units);
      // 旧版本状态迁移：not_shipped（未发往得物）→ arrived（已到货）
      let dirty = false;
      for (const r of rows) {
        if ((r.status as string) === "not_shipped") {
          r.status = "arrived";
          dirty = true;
        }
      }
      if (dirty) write(KEYS.units, rows);
      return rows;
    },
    async createUnits(inputs: NewUnit[]) {
      const rows = read<InventoryUnit>(KEYS.units);
      const created: InventoryUnit[] = inputs.map((input) => ({
        id: uuid(),
        ...input,
        created_at: now(),
        updated_at: now(),
      }));
      write(KEYS.units, [...rows, ...created]);
      return created;
    },
    async updateUnit(id, patch) {
      const rows = read<InventoryUnit>(KEYS.units);
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("库存不存在");
      rows[i] = { ...rows[i], ...patch, updated_at: now() };
      write(KEYS.units, rows);
      return rows[i];
    },
    async deleteUnit(id) {
      write(
        KEYS.units,
        read<InventoryUnit>(KEYS.units).filter((r) => r.id !== id),
      );
      write(
        KEYS.history,
        read<StatusHistory>(KEYS.history).filter((r) => r.unit_id !== id),
      );
      write(
        KEYS.sales,
        read<Sale>(KEYS.sales).filter((r) => r.unit_id !== id),
      );
    },

    async listSales() {
      return read<Sale>(KEYS.sales);
    },
    async upsertSale(input: NewSale) {
      const rows = read<Sale>(KEYS.sales);
      const i = rows.findIndex((r) => r.unit_id === input.unit_id);
      if (i >= 0) {
        rows[i] = { ...rows[i], ...input, updated_at: now() };
        write(KEYS.sales, rows);
        return rows[i];
      }
      const row: Sale = { id: uuid(), ...input, created_at: now(), updated_at: now() };
      write(KEYS.sales, [...rows, row]);
      return row;
    },
    async deleteSaleByUnit(unitId) {
      write(
        KEYS.sales,
        read<Sale>(KEYS.sales).filter((r) => r.unit_id !== unitId),
      );
    },

    async listHistory(unitId?: string) {
      const rows = read<StatusHistory>(KEYS.history);
      const filtered = unitId ? rows.filter((r) => r.unit_id === unitId) : rows;
      return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async addHistory(entries: NewHistory[]) {
      const rows = read<StatusHistory>(KEYS.history);
      let nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      const created: StatusHistory[] = entries.map((e) => ({
        id: nextId++,
        ...e,
        created_at: now(),
      }));
      write(KEYS.history, [...rows, ...created]);
    },

    async saveAttachment({ file, owner_type, owner_id, kind }: SaveAttachmentInput) {
      const rows = read<Attachment>(KEYS.attachments);
      const row: Attachment = {
        id: uuid(),
        owner_type,
        owner_id,
        kind,
        path: "",
        content_type: file.type || null,
        created_at: now(),
      };
      row.path = `local:${row.id}`;
      await idbPut(row.id, file);
      write(KEYS.attachments, [...rows, row]);
      return row;
    },
    async listAttachments(owner_type, owner_id) {
      return read<Attachment>(KEYS.attachments).filter(
        (a) => a.owner_type === owner_type && a.owner_id === owner_id,
      );
    },
    async attachmentUrl(att) {
      const blob = await idbGet(att.path.replace(/^local:/, ""));
      if (!blob) return "";
      return URL.createObjectURL(blob);
    },
  };
}
