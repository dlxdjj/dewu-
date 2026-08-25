import { PURCHASE_INITIAL_STATUSES } from "@/lib/constants/status";
import type {
  CleanupResult,
  ClientEventSummary,
  ClearResult,
  DbAdapter,
  DeleteResult,
  ImportPurchasesInput,
  ImportPurchasesResult,
  InventoryPageInput,
  InventoryPageResult,
  HomeDashboardResult,
  PurchaseInput,
  PurchaseResult,
  ReportDashboardInput,
  ReportDashboardResult,
  SaveMonthlyRebatesInput,
  SaveAttachmentInput,
  ShipUnitsInput,
  ShipUnitsResult,
  StatusChangeInput,
} from "@/lib/data/types";
import {
  legacyHomeDashboard,
  legacyInventoryGroupsPage,
  legacyReportDashboard,
} from "@/lib/data/dashboard-fallback";
import { allocateShippingCents } from "@/lib/services/shipping";
import type {
  AccountPreferences,
  Attachment,
  CatalogProduct,
  InventoryUnit,
  MonthlyRebate,
  Product,
  PurchaseBatch,
  Sale,
  ShippingEvent,
  ShippingEventItem,
  StatusHistory,
  StorageDeletionJob,
} from "@/lib/types/database";
import { assertCents } from "@/lib/utils/money";
import { normalizeStyleCode } from "@/lib/catalog";

export interface MemoryState {
  products: Product[];
  batches: PurchaseBatch[];
  units: InventoryUnit[];
  sales: Sale[];
  rebates: MonthlyRebate[];
  shippingEvents: ShippingEvent[];
  shippingEventItems: ShippingEventItem[];
  history: StatusHistory[];
  attachments: Attachment[];
  cleanupJobs: StorageDeletionJob[];
  preferences: AccountPreferences;
  catalogProducts: CatalogProduct[];
  importHashes: string[];
}

const clone = <T,>(value: T): T => structuredClone(value);
const now = (): string => new Date().toISOString();
const id = (): string => crypto.randomUUID();

export class MemoryDbAdapter implements DbAdapter {
  readonly kind = "memory" as const;
  private state: MemoryState;
  private failureAfterMutation: number | null = null;

  constructor(seed: Partial<MemoryState> = {}) {
    this.state = clone({
      products: seed.products ?? [],
      batches: seed.batches ?? [],
      units: seed.units ?? [],
      sales: seed.sales ?? [],
      rebates: seed.rebates ?? [],
      shippingEvents: seed.shippingEvents ?? [],
      shippingEventItems: seed.shippingEventItems ?? [],
      history: seed.history ?? [],
      attachments: seed.attachments ?? [],
      cleanupJobs: seed.cleanupJobs ?? [],
      preferences: seed.preferences ?? {
        user_id: "test-user",
        workflow: "standard",
        updated_at: now(),
      },
      catalogProducts: seed.catalogProducts ?? [],
      importHashes: seed.importHashes ?? [],
    });
  }

  snapshot(): MemoryState {
    return clone(this.state);
  }

  injectFailureAfter(mutationCount: number | null): void {
    this.failureAfterMutation = mutationCount;
  }

  private transaction<T>(
    work: (draft: MemoryState, mutate: () => void) => T,
  ): T {
    const draft = clone(this.state);
    let count = 0;
    const mutate = () => {
      count += 1;
      if (
        this.failureAfterMutation != null &&
        count >= this.failureAfterMutation
      ) {
        throw new Error("注入事务故障");
      }
    };
    const result = work(draft, mutate);
    this.state = draft;
    return result;
  }

  async listProducts() {
    return clone(this.state.products);
  }

  async listBatches() {
    return clone(this.state.batches);
  }

  async listUnits() {
    return clone(this.state.units);
  }

  async listSales() {
    return clone(this.state.sales);
  }

  async listRebates() {
    return clone(this.state.rebates);
  }

  async getAccountPreferences() {
    return clone(this.state.preferences);
  }

  getHomeDashboard(month: string): Promise<HomeDashboardResult> {
    return legacyHomeDashboard(this, month);
  }

  listInventoryGroupsPage(
    input: InventoryPageInput,
  ): Promise<InventoryPageResult> {
    return legacyInventoryGroupsPage(this, input);
  }

  getReportDashboard(
    input: ReportDashboardInput,
  ): Promise<ReportDashboardResult> {
    return legacyReportDashboard(this, input);
  }

  async getClientEventSummary(): Promise<ClientEventSummary> {
    return { errors: 0, slowRequests: 0, imageErrors: 0, lastEventAt: null };
  }

  async listCatalogProducts() {
    return clone(this.state.catalogProducts);
  }

  async listShippingEvents() {
    return clone(this.state.shippingEvents);
  }

  async listShippingEventItems() {
    return clone(this.state.shippingEventItems);
  }

  async listHistory(unitId?: string) {
    return clone(
      unitId
        ? this.state.history.filter((row) => row.unit_id === unitId)
        : this.state.history,
    );
  }

  async listAttachments(
    ownerType: Attachment["owner_type"],
    ownerId?: string,
  ) {
    return clone(
      this.state.attachments.filter(
        (row) =>
          row.owner_type === ownerType && (!ownerId || row.owner_id === ownerId),
      ),
    );
  }

  async listAttachmentsByOwnerIds(
    ownerType: Attachment["owner_type"],
    ownerIds: string[],
  ) {
    const wanted = new Set(ownerIds);
    return clone(
      this.state.attachments.filter(
        (row) => row.owner_type === ownerType && wanted.has(row.owner_id),
      ),
    );
  }

  async attachmentUrl(attachment: Attachment) {
    return `memory://${attachment.path}`;
  }

  async catalogImageUrl(catalogProduct: CatalogProduct) {
    if (!catalogProduct.image_path) throw new Error("该商品资料没有图片");
    return `memory://${catalogProduct.image_path}`;
  }

  async saveAttachment(input: SaveAttachmentInput) {
    const row: Attachment = {
      id: id(),
      user_id: "test-user",
      owner_type: input.owner_type,
      owner_id: input.owner_id,
      kind: input.kind,
      path: `test-user/${input.owner_type}/${input.owner_id}/${id()}`,
      content_type: input.file.type || null,
      created_at: now(),
    };
    this.state.attachments.push(row);
    if (
      this.state.preferences.workflow === "standard" &&
      input.owner_type === "product" &&
      input.kind === "product_image"
    ) {
      const product = this.state.products.find((item) => item.id === input.owner_id);
      if (product?.style_code) {
        const normalized = normalizeStyleCode(product.style_code);
        let catalog = this.state.catalogProducts.find(
          (item) => item.normalized_style_code === normalized,
        );
        if (!catalog) {
          catalog = {
            id: id(),
            normalized_style_code: normalized,
            display_style_code: product.style_code,
            canonical_name: product.name,
            image_path: row.path,
            source_user_id: "test-user",
            verified_at: now(),
            created_at: now(),
            updated_at: now(),
          };
          this.state.catalogProducts.push(catalog);
        } else {
          catalog.canonical_name = product.name;
          catalog.display_style_code = product.style_code;
          catalog.image_path = row.path;
          catalog.updated_at = now();
        }
        product.catalog_product_id = catalog.id;
      }
    }
    return clone(row);
  }

  async createPurchase(input: PurchaseInput): Promise<PurchaseResult> {
    return this.transaction((draft, mutate) => {
      assertCents(input.unitPriceCents);
      if (!input.productName.trim()) throw new Error("请填写品名");
      const styleCode = input.styleCode.trim();
      if (!styleCode) throw new Error("请填写货号");
      if (
        !Number.isSafeInteger(input.quantity) ||
        input.quantity < 1 ||
        input.quantity > 999
      ) {
        throw new Error("数量需为 1 至 999 的整数");
      }
      if (
        !PURCHASE_INITIAL_STATUSES.includes(
          input.initialStatus as (typeof PURCHASE_INITIAL_STATUSES)[number],
        )
      ) {
        throw new Error("新增采购不能直接进入寄出、销售、结算或退款状态");
      }
      if (this.state.preferences.workflow === "standard" && !input.size.trim()) {
        throw new Error("请填写尺码");
      }

      const timestamp = now();
      const normalized = normalizeStyleCode(styleCode);
      const catalog = draft.catalogProducts.find(
        (row) => row.normalized_style_code === normalized,
      );
      let product = draft.products.find(
        (row) => normalizeStyleCode(row.style_code) === normalized,
      );
      if (!product) {
        product = {
          id: id(),
          user_id: "test-user",
          name:
            draft.preferences.workflow === "bulk" && catalog
              ? catalog.canonical_name
              : input.productName,
          style_code:
            draft.preferences.workflow === "bulk" && catalog
              ? catalog.display_style_code
              : styleCode,
          brand: null,
          catalog_product_id: catalog?.id ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        draft.products.push(product);
        mutate();
      } else if (draft.preferences.workflow === "bulk" && catalog) {
        product.name = catalog.canonical_name;
        product.style_code = catalog.display_style_code;
        product.catalog_product_id = catalog.id;
        product.updated_at = timestamp;
        mutate();
      }

      const batch: PurchaseBatch = {
        id: id(),
        user_id: "test-user",
        product_id: product.id,
        platform: draft.preferences.workflow === "bulk" ? "other" : input.platform,
        order_no: input.orderNo || null,
        unit_price_cents: input.unitPriceCents,
        quantity: input.quantity,
        shipping_fee_cents: 0,
        discount_amount_cents: 0,
        purchased_at: input.purchasedAt,
        note: input.note || null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      draft.batches.push(batch);
      mutate();

      const unitIds: string[] = [];
      for (let index = 0; index < input.quantity; index += 1) {
        const unit: InventoryUnit = {
          id: id(),
          user_id: "test-user",
          batch_id: batch.id,
          product_id: product.id,
          size: input.size,
          unit_cost_cents: input.unitPriceCents,
          listing_price_cents: null,
          outbound_shipping_cents: 0,
          status: input.initialStatus,
          created_at: timestamp,
          updated_at: timestamp,
        };
        draft.units.push(unit);
        draft.history.push({
          id: id(),
          user_id: "test-user",
          unit_id: unit.id,
          from_status: null,
          to_status: input.initialStatus,
          note: "采购入库",
          created_at: timestamp,
        });
        unitIds.push(unit.id);
        mutate();
      }
      if (draft.preferences.workflow === "standard") {
        let shared = draft.catalogProducts.find(
          (row) => row.normalized_style_code === normalized,
        );
        if (!shared) {
          shared = {
            id: id(),
            normalized_style_code: normalized,
            display_style_code: product.style_code ?? styleCode,
            canonical_name: product.name,
            image_path: null,
            source_user_id: "test-user",
            verified_at: timestamp,
            created_at: timestamp,
            updated_at: timestamp,
          };
          draft.catalogProducts.push(shared);
        } else {
          shared.canonical_name = product.name;
          shared.display_style_code = product.style_code ?? styleCode;
          shared.updated_at = timestamp;
        }
        product.catalog_product_id = shared.id;
      }
      return { productId: product.id, batchId: batch.id, unitIds };
    });
  }

  async importPurchases(input: ImportPurchasesInput): Promise<ImportPurchasesResult> {
    if (this.state.preferences.workflow !== "bulk") {
      throw new Error("当前账号未开启表格导入");
    }
    return this.transaction((draft, mutate) => {
      if (draft.importHashes.includes(input.fileHash)) {
        throw new Error("这份表格已经导入过");
      }
      if (!input.rows.length || input.rows.length > 1000) {
        throw new Error("表格行数不正确");
      }
      const timestamp = now();
      let unitCount = 0;
      let totalCostCents = 0;
      let matchedRows = 0;
      for (const row of input.rows) {
        assertCents(row.unitPriceCents);
        if (!row.productName.trim() || !row.styleCode.trim()) {
          throw new Error(`第 ${row.rowNumber} 行缺少货号或货品名称`);
        }
        if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 999) {
          throw new Error(`第 ${row.rowNumber} 行数量不正确`);
        }
        unitCount += row.quantity;
        if (unitCount > 5000) throw new Error("单次最多导入 5000 件");
        const normalized = normalizeStyleCode(row.styleCode);
        const catalog = draft.catalogProducts.find(
          (item) => item.normalized_style_code === normalized,
        );
        if (catalog) matchedRows += 1;
        let product = draft.products.find(
          (item) => normalizeStyleCode(item.style_code) === normalized,
        );
        if (!product) {
          product = {
            id: id(), user_id: "test-user", brand: null,
            name: catalog?.canonical_name ?? row.productName.trim(),
            style_code: catalog?.display_style_code ?? row.styleCode.trim(),
            catalog_product_id: catalog?.id ?? null,
            created_at: timestamp, updated_at: timestamp,
          };
          draft.products.push(product);
          mutate();
        } else if (catalog) {
          product.name = catalog.canonical_name;
          product.style_code = catalog.display_style_code;
          product.catalog_product_id = catalog.id;
          product.updated_at = timestamp;
          mutate();
        }
        const batch: PurchaseBatch = {
          id: id(), user_id: "test-user", product_id: product.id,
          platform: "other", order_no: null,
          unit_price_cents: row.unitPriceCents, quantity: row.quantity,
          shipping_fee_cents: 0, discount_amount_cents: 0,
          purchased_at: input.purchasedAt, note: "表格导入",
          created_at: timestamp, updated_at: timestamp,
        };
        draft.batches.push(batch);
        mutate();
        for (let index = 0; index < row.quantity; index += 1) {
          const unitId = id();
          draft.units.push({
            id: unitId, user_id: "test-user", batch_id: batch.id,
            product_id: product.id, size: row.size.trim(),
            unit_cost_cents: row.unitPriceCents, listing_price_cents: null,
            outbound_shipping_cents: 0, status: "arrived",
            created_at: timestamp, updated_at: timestamp,
          });
          draft.history.push({
            id: id(), user_id: "test-user", unit_id: unitId,
            from_status: null, to_status: "arrived", note: "表格导入",
            created_at: timestamp,
          });
          mutate();
        }
        totalCostCents += row.unitPriceCents * row.quantity;
      }
      draft.importHashes.push(input.fileHash);
      mutate();
      return {
        importId: id(), rowCount: input.rows.length, unitCount,
        totalCostCents, matchedRows,
        unmatchedRows: input.rows.length - matchedRows,
      };
    });
  }

  async assignUnitSizes(assignments: { unitId: string; size: string }[]) {
    return this.transaction((draft, mutate) => {
      if (!assignments.length || new Set(assignments.map((item) => item.unitId)).size !== assignments.length) {
        throw new Error("尺码分配无效或重复");
      }
      for (const assignment of assignments) {
        const size = assignment.size.trim();
        if (!size || size.length > 40) throw new Error("请填写正确的尺码");
        const unit = draft.units.find((row) => row.id === assignment.unitId);
        if (!unit) throw new Error("库存不存在");
        unit.size = size;
        unit.updated_at = now();
        mutate();
      }
      return assignments.length;
    });
  }

  async shipUnits(input: ShipUnitsInput): Promise<ShipUnitsResult> {
    return this.transaction((draft, mutate) => {
      const unique = new Set(input.unitIds);
      if (!input.unitIds.length || unique.size !== input.unitIds.length) {
        throw new Error("商品 ID 无效或重复");
      }
      const units = input.unitIds.map((unitId) =>
        draft.units.find((row) => row.id === unitId),
      );
      if (units.some((unit) => !unit || unit.status === "refunded")) {
        throw new Error("所选商品不存在或已采购退款");
      }
      const valid = units as InventoryUnit[];
      const overwrittenUnitIds = valid
        .filter((unit) => unit.outbound_shipping_cents > 0)
        .map((unit) => unit.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.shippedAt)) {
        throw new Error("寄出日期格式不正确");
      }
      const allocations = allocateShippingCents(
        valid.map((unit) => ({
          id: unit.id,
          createdAt: unit.created_at,
          currentShippingCents: unit.outbound_shipping_cents,
        })),
        input.totalShippingCents,
      );

      const timestamp = now();
      if (input.mode === "replace") {
        for (const item of draft.shippingEventItems) {
          if (item.active && unique.has(item.unit_id)) {
            item.active = false;
            item.voided_at = timestamp;
            mutate();
          }
        }
      }
      const event: ShippingEvent = {
        id: id(),
        user_id: "test-user",
        shipped_at: input.shippedAt,
        total_shipping_cents: input.totalShippingCents,
        mode: input.mode,
        estimated: false,
        note: null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      draft.shippingEvents.push(event);
      mutate();

      for (const allocation of allocations) {
        const unit = valid.find((row) => row.id === allocation.unitId)!;
        const from = unit.status;
        draft.sales = draft.sales.filter((row) => row.unit_id !== unit.id);
        unit.outbound_shipping_cents =
          input.mode === "append"
            ? unit.outbound_shipping_cents + allocation.shippingCents
            : allocation.shippingCents;
        unit.status = "shipping";
        unit.updated_at = now();
        draft.history.push({
          id: id(),
          user_id: unit.user_id,
          unit_id: unit.id,
          from_status: from,
          to_status: "shipping",
          note: input.mode === "replace" && overwrittenUnitIds.includes(unit.id)
            ? "纠正累计寄出运费"
            : valid.length === 1
              ? "单件寄出"
              : "批量寄出",
          created_at: timestamp,
        });
        draft.shippingEventItems.push({
          id: id(),
          user_id: unit.user_id,
          event_id: event.id,
          unit_id: unit.id,
          allocated_shipping_cents: allocation.shippingCents,
          active: true,
          voided_at: null,
          created_at: timestamp,
        });
        mutate();
      }
      return {
        allocations,
        totalShippingCents: input.totalShippingCents,
        overwrittenUnitIds,
      };
    });
  }

  async settleUnits(input: {
    unitIds: string[];
    actualPayoutCents: number;
    settledAt: string;
  }) {
    this.transaction((draft, mutate) => {
      assertCents(input.actualPayoutCents);
      if (
        !input.unitIds.length ||
        new Set(input.unitIds).size !== input.unitIds.length
      ) {
        throw new Error("商品 ID 无效或重复");
      }
      for (const unitId of input.unitIds) {
        const unit = draft.units.find((row) => row.id === unitId);
        if (!unit || unit.status === "refunded") {
          throw new Error("商品不存在或已退款");
        }
        const existing = draft.sales.find((row) => row.unit_id === unitId);
        const timestamp = now();
        const sale: Sale = {
          id: existing?.id ?? id(),
          user_id: unit.user_id,
          unit_id: unit.id,
          sold_price_cents: 0,
          platform_fee_cents: 0,
          platform_subsidy_cents: 0,
          express_fee_cents: 0,
          other_fee_cents: 0,
          actual_payout_cents: input.actualPayoutCents,
          sold_at: existing?.sold_at ?? input.settledAt,
          settled_at: input.settledAt,
          created_at: existing?.created_at ?? timestamp,
          updated_at: timestamp,
        };
        if (existing) Object.assign(existing, sale);
        else draft.sales.push(sale);
        const from = unit.status;
        unit.status = "settled";
        unit.updated_at = timestamp;
        draft.history.push({
          id: id(),
          user_id: unit.user_id,
          unit_id: unit.id,
          from_status: from,
          to_status: "settled",
          note: "登记到手价",
          created_at: timestamp,
        });
        mutate();
      }
    });
  }

  async changeStatus(input: StatusChangeInput) {
    this.transaction((draft, mutate) => {
      if (
        !input.unitIds.length ||
        new Set(input.unitIds).size !== input.unitIds.length
      ) {
        throw new Error("商品 ID 无效或重复");
      }
      if (input.toStatus === "refunded") {
        throw new Error("采购退款必须走专用操作");
      }
      if (input.toStatus === "settled") {
        throw new Error("结算必须登记实际到手价和结算日期");
      }
      if (input.toStatus === "shipping") {
        throw new Error("寄出必须录入快递费");
      }

      for (const unitId of input.unitIds) {
        const unit = draft.units.find((row) => row.id === unitId);
        if (!unit) throw new Error("库存不存在");
        if (unit.status === input.toStatus) continue;

        const from = unit.status;
        const timestamp = now();
        if (input.toStatus === "sold") {
          const existing = draft.sales.find((row) => row.unit_id === unitId);
          if (existing) {
            existing.actual_payout_cents = null;
            existing.settled_at = null;
            existing.sold_at ??= timestamp.slice(0, 10);
            existing.updated_at = timestamp;
          } else {
            draft.sales.push({
              id: id(),
              user_id: unit.user_id,
              unit_id: unit.id,
              sold_price_cents: null,
              platform_fee_cents: 0,
              platform_subsidy_cents: 0,
              express_fee_cents: 0,
              other_fee_cents: 0,
              actual_payout_cents: null,
              sold_at: timestamp.slice(0, 10),
              settled_at: null,
              created_at: timestamp,
              updated_at: timestamp,
            });
          }
        } else {
          draft.sales = draft.sales.filter((row) => row.unit_id !== unitId);
        }
        unit.status = input.toStatus;
        unit.updated_at = timestamp;
        draft.history.push({
          id: id(),
          user_id: unit.user_id,
          unit_id: unit.id,
          from_status: from,
          to_status: input.toStatus,
          note: input.note?.trim() || null,
          created_at: timestamp,
        });
        mutate();
      }
    });
  }

  async refundUnit(input: { unitId: string; note?: string }) {
    this.transaction((draft, mutate) => {
      const unit = draft.units.find((row) => row.id === input.unitId);
      if (!unit) throw new Error("库存不存在");
      const from = unit.status;
      const timestamp = now();
      draft.sales = draft.sales.filter((row) => row.unit_id !== unit.id);
      unit.status = "refunded";
      unit.updated_at = timestamp;
      draft.history.push({
        id: id(),
        user_id: unit.user_id,
        unit_id: unit.id,
        from_status: from,
        to_status: "refunded",
        note: input.note?.trim() || "采购平台退货退款",
        created_at: timestamp,
      });
      mutate();
    });
  }

  async saveMonthlyRebates(input: SaveMonthlyRebatesInput) {
    return clone(
      this.transaction((draft, mutate) => {
        if (draft.preferences.workflow !== "standard") {
          throw new Error("当前账号不支持返利收入");
        }
        assertCents(input.taobaoAllianceCents, "淘宝联盟返利");
        assertCents(input.jingfenCents, "京粉返利");
        if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(input.month)) {
          throw new Error("返利月份格式不正确");
        }

        const timestamp = now();
        const values = [
          {
            source: "taobao_alliance" as const,
            amountCents: input.taobaoAllianceCents,
          },
          { source: "jingfen" as const, amountCents: input.jingfenCents },
        ];
        const rows = values.map(({ source, amountCents }) => {
          const existing = draft.rebates.find(
            (row) => row.month === input.month && row.source === source,
          );
          if (existing) {
            existing.amount_cents = amountCents;
            existing.updated_at = timestamp;
            mutate();
            return existing;
          }
          const row: MonthlyRebate = {
            id: id(),
            user_id: "test-user",
            month: input.month,
            source,
            amount_cents: amountCents,
            created_at: timestamp,
            updated_at: timestamp,
          };
          draft.rebates.push(row);
          mutate();
          return row;
        });
        return rows;
      }),
    );
  }

  async deleteUnitDeep(input: { unitId: string }): Promise<DeleteResult> {
    return this.transaction((draft, mutate) => {
      const unit = draft.units.find((row) => row.id === input.unitId);
      if (!unit) throw new Error("库存不存在");
      const saleIds = draft.sales
        .filter((row) => row.unit_id === unit.id)
        .map((row) => row.id);
      const owners = new Set([unit.id, ...saleIds]);
      const paths: string[] = [];
      draft.attachments = draft.attachments.filter((attachment) => {
        const remove =
          (attachment.owner_type === "unit" &&
            owners.has(attachment.owner_id)) ||
          (attachment.owner_type === "sale" &&
            owners.has(attachment.owner_id));
        if (remove) paths.push(attachment.path);
        return !remove;
      });
      draft.sales = draft.sales.filter((row) => row.unit_id !== unit.id);
      draft.history = draft.history.filter((row) => row.unit_id !== unit.id);
      draft.shippingEventItems = draft.shippingEventItems.filter(
        (row) => row.unit_id !== unit.id,
      );
      const usedEventIds = new Set(
        draft.shippingEventItems.map((row) => row.event_id),
      );
      draft.shippingEvents = draft.shippingEvents.filter((row) =>
        usedEventIds.has(row.id),
      );
      draft.units = draft.units.filter((row) => row.id !== unit.id);

      let deletedBatch = false;
      let deletedProduct = false;
      if (!draft.units.some((row) => row.batch_id === unit.batch_id)) {
        const batchPaths = draft.attachments
          .filter(
            (row) =>
              row.owner_type === "batch" && row.owner_id === unit.batch_id,
          )
          .map((row) => row.path);
        paths.push(...batchPaths);
        draft.attachments = draft.attachments.filter(
          (row) =>
            !(row.owner_type === "batch" && row.owner_id === unit.batch_id),
        );
        draft.batches = draft.batches.filter((row) => row.id !== unit.batch_id);
        deletedBatch = true;
      }
      if (
        !draft.units.some((row) => row.product_id === unit.product_id) &&
        !draft.batches.some((row) => row.product_id === unit.product_id)
      ) {
        const productPaths = draft.attachments
          .filter(
            (row) =>
              row.owner_type === "product" &&
              row.owner_id === unit.product_id,
          )
          .map((row) => row.path);
        paths.push(...productPaths);
        draft.attachments = draft.attachments.filter(
          (row) =>
            !(
              row.owner_type === "product" &&
              row.owner_id === unit.product_id
            ),
        );
        draft.products = draft.products.filter(
          (row) => row.id !== unit.product_id,
        );
        deletedProduct = true;
      }
      for (const path of paths) {
        draft.cleanupJobs.push({
          id: id(),
          user_id: unit.user_id,
          path,
          created_at: now(),
          completed_at: null,
        });
      }
      mutate();
      return {
        deletedUnitId: unit.id,
        deletedBatch,
        deletedProduct,
        pendingStoragePaths: paths,
      };
    });
  }

  async clearAllData(input: { confirmation: "清空" }): Promise<ClearResult> {
    if (input.confirmation !== "清空") throw new Error("确认词错误");
    return this.transaction((draft, mutate) => {
      const result: ClearResult = {
        products: draft.products.length,
        batches: draft.batches.length,
        units: draft.units.length,
        sales: draft.sales.length,
        rebates: draft.rebates.length,
        history: draft.history.length,
        attachments: draft.attachments.length,
        pendingStoragePaths: draft.attachments.map((row) => row.path),
      };
      for (const path of result.pendingStoragePaths) {
        draft.cleanupJobs.push({
          id: id(),
          user_id: "test-user",
          path,
          created_at: now(),
          completed_at: null,
        });
      }
      draft.products = [];
      draft.batches = [];
      draft.units = [];
      draft.sales = [];
      draft.rebates = [];
      draft.shippingEvents = [];
      draft.shippingEventItems = [];
      draft.history = [];
      draft.attachments = [];
      mutate();
      return result;
    });
  }

  async retryStorageCleanup(): Promise<CleanupResult> {
    const pending = this.state.cleanupJobs.filter(
      (row) => row.completed_at == null,
    );
    pending.forEach((row) => {
      row.completed_at = now();
    });
    return {
      attempted: pending.length,
      completed: pending.length,
      pending: 0,
      failedPaths: [],
    };
  }
}
