# 商品图片、库存分组与经营指标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Supabase-only PWA 中实现货号必填、商品图片复用/替换、按购入平台筛选并按货号与尺码合并库存，以及首页和报表的新统计口径。

**Architecture:** 保留现有表结构与私有 `attachments` bucket，扩展 DbAdapter 以一次读取同类附件元数据，并用纯函数处理商品身份、最新图片、库存分组和结算统计。页面只负责加载、交互和展示；数据库迁移作为货号必填的最后一道防线，历史无货号数据仍可读取。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、Supabase PostgreSQL/RPC/Storage、Vitest、Testing Library、Playwright、GitHub Actions/Pages。

## Global Constraints

- 新增采购的货号必须为非空白字符串；历史无货号数据不得删除或阻塞迁移。
- 图片沿用 `owner_type = product`、`kind = product_image`、私有 `attachments` bucket 和 900 秒签名 URL；压缩保持最长边 1200px、JPEG 质量 0.82。
- 库存先按购入平台筛选，再按标准化货号和标准化尺码合并；成本、状态、批次不同也属于同组。
- 首页只展示库存数量、库存成本、当前自然月销量、当前自然月利润。
- 销售额使用 `actual_payout_cents`；销量和利润按 `settled_at` 归属月份；利润为实际到账减采购成本减发出运费。
- 不修改 OCR 逻辑，不增加得物挂牌价，不实现离线写入队列，不公开数据库密码或 service-role key。
- GitHub Pages 保持 `output: "export"` 和 `NEXT_PUBLIC_BASE_PATH=/dewu-`。

---

### Task 1: 商品身份与批量图片元数据

**Files:**
- Create: `src/lib/catalog.ts`
- Create: `src/lib/catalog.test.ts`
- Modify: `src/lib/data/types.ts`
- Modify: `src/lib/data/cloud.ts`
- Modify: `src/lib/data/memory.ts`

**Interfaces:**
- Produces: `normalizeStyleCode(value: string | null | undefined): string`
- Produces: `findProductByStyleCode(products: Product[], value: string): Product | undefined`
- Produces: `latestProductImageByOwner(attachments: Attachment[]): Map<string, Attachment>`
- Produces: `loadProductImageUrls(db: Pick<DbAdapter, "listAttachments" | "attachmentUrl">, productIds: Iterable<string>): Promise<Map<string, string>>`
- Changes: `DbAdapter.listAttachments(ownerType: AttachmentOwner, ownerId?: string): Promise<Attachment[]>`

- [ ] **Step 1: 写商品身份和图片选择失败测试**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  findProductByStyleCode,
  latestProductImageByOwner,
  loadProductImageUrls,
  normalizeStyleCode,
} from "./catalog";

describe("catalog", () => {
  it("normalizes and finds style codes without case or edge spaces", () => {
    expect(normalizeStyleCode("  Ab-01 ")).toBe("ab-01");
    expect(findProductByStyleCode([
      { id: "p1", user_id: "u", name: "鞋", style_code: "AB-01", brand: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
    ], " ab-01 ")?.id).toBe("p1");
  });

  it("keeps only the newest product_image for each product", () => {
    const latest = latestProductImageByOwner([
      { id: "a1", user_id: "u", owner_type: "product", owner_id: "p1", kind: "product_image", path: "old", content_type: "image/jpeg", created_at: "2026-08-01T00:00:00Z" },
      { id: "a2", user_id: "u", owner_type: "product", owner_id: "p1", kind: "product_image", path: "new", content_type: "image/jpeg", created_at: "2026-08-02T00:00:00Z" },
      { id: "a3", user_id: "u", owner_type: "product", owner_id: "p1", kind: "order_screenshot", path: "order", content_type: "image/jpeg", created_at: "2026-08-03T00:00:00Z" },
    ]);
    expect(latest.get("p1")?.path).toBe("new");
  });

  it("isolates one signed-url failure from other products", async () => {
    const db = {
      listAttachments: vi.fn().mockResolvedValue([
        { id: "a1", user_id: "u", owner_type: "product", owner_id: "p1", kind: "product_image", path: "ok", content_type: "image/jpeg", created_at: "2026-08-01T00:00:00Z" },
        { id: "a2", user_id: "u", owner_type: "product", owner_id: "p2", kind: "product_image", path: "bad", content_type: "image/jpeg", created_at: "2026-08-01T00:00:00Z" },
      ]),
      attachmentUrl: vi.fn().mockImplementation((row) => row.path === "ok" ? Promise.resolve("https://signed/ok") : Promise.reject(new Error("sign failed"))),
    };
    await expect(loadProductImageUrls(db, ["p1", "p2"])).resolves.toEqual(new Map([["p1", "https://signed/ok"]]));
    expect(db.listAttachments).toHaveBeenCalledWith("product");
  });
});
```

- [ ] **Step 2: 运行测试并确认模块不存在导致失败**

Run: `npm run test:ci -- src/lib/catalog.test.ts`  
Expected: FAIL，提示无法解析 `./catalog`。

- [ ] **Step 3: 扩展附件列表接口并保持单 owner 调用兼容**

```ts
// src/lib/data/types.ts
listAttachments(ownerType: AttachmentOwner, ownerId?: string): Promise<Attachment[]>;

// src/lib/data/cloud.ts
listAttachments: (ownerType, ownerId) => {
  let query = client
    .from("attachments")
    .select("*")
    .eq("owner_type", ownerType)
    .order("created_at");
  if (ownerId) query = query.eq("owner_id", ownerId);
  return request<Attachment[]>(query as PromiseLike<QueryResponse<Attachment[]>>);
},

// src/lib/data/memory.ts
async listAttachments(ownerType: Attachment["owner_type"], ownerId?: string) {
  return clone(this.state.attachments.filter((row) =>
    row.owner_type === ownerType && (!ownerId || row.owner_id === ownerId),
  ));
}
```

- [ ] **Step 4: 实现商品匹配、最新附件和容错签名 URL**

```ts
export function normalizeStyleCode(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function findProductByStyleCode(products: Product[], value: string): Product | undefined {
  const normalized = normalizeStyleCode(value);
  if (!normalized) return undefined;
  return products.find((product) => normalizeStyleCode(product.style_code) === normalized);
}

export function latestProductImageByOwner(attachments: Attachment[]): Map<string, Attachment> {
  const result = new Map<string, Attachment>();
  for (const attachment of attachments) {
    if (attachment.owner_type !== "product" || attachment.kind !== "product_image") continue;
    const current = result.get(attachment.owner_id);
    if (!current || `${attachment.created_at}|${attachment.id}` > `${current.created_at}|${current.id}`) {
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
  const pairs = await Promise.all([...wanted].map(async (productId) => {
    const attachment = latest.get(productId);
    if (!attachment) return null;
    try { return [productId, await db.attachmentUrl(attachment)] as const; }
    catch { return null; }
  }));
  return new Map(pairs.filter((pair): pair is readonly [string, string] => pair !== null));
}
```

- [ ] **Step 5: 验证并提交商品图片基础能力**

Run: `npm run test:ci -- src/lib/catalog.test.ts src/lib/data/index.test.ts`  
Expected: PASS。  
Run: `npm run typecheck`  
Expected: PASS。  
Commit: `git add src/lib/catalog.ts src/lib/catalog.test.ts src/lib/data/types.ts src/lib/data/cloud.ts src/lib/data/memory.ts && git commit -m "feat: add catalog image lookup"`

### Task 2: 货号必填的三层防线

**Files:**
- Create: `src/lib/services/purchase.test.ts`
- Create: `src/lib/style-code-migration.test.ts`
- Create: `supabase/migrations/0003_require_style_code.sql`
- Modify: `src/lib/services/purchase.ts`
- Modify: `src/lib/data/memory.ts`
- Modify: `src/lib/services/maintenance.test.ts`
- Modify: `src/lib/services/shipping.test.ts`
- Modify: `src/lib/reports.test.ts`

**Interfaces:**
- Consumes: `normalizeStyleCode` from Task 1.
- Changes: `PurchaseFormInput.styleCode` from optional to required `string`.
- Preserves: `createPurchase(db, input): Promise<PurchaseResult>`.

- [ ] **Step 1: 写服务、内存适配器和迁移失败测试**

```ts
it("rejects a blank style code before calling the adapter", async () => {
  const createPurchaseRpc = vi.fn();
  await expect(createPurchase({ createPurchase: createPurchaseRpc } as unknown as DbAdapter, {
    productName: "鞋", styleCode: "   ", platform: "taobao", unitPriceYuan: "100",
    quantity: 1, purchasedAt: "2026-08-04", size: "42", initialStatus: "arrived",
  })).rejects.toThrow("请填写货号");
  expect(createPurchaseRpc).not.toHaveBeenCalled();
});

it("rejects blank style codes in the memory database contract", async () => {
  const db = new MemoryDbAdapter();
  await expect(db.createPurchase({
    productName: "鞋", styleCode: " ", platform: "taobao", unitPriceCents: 10000,
    quantity: 1, purchasedAt: "2026-08-04", size: "42", initialStatus: "arrived", orderNo: "", note: "",
  })).rejects.toThrow("请填写货号");
});

it("adds a not-valid product constraint and validates the RPC input", () => {
  expect(migration).toMatch(/products_style_code_nonblank[\s\S]*check[\s\S]*btrim\(style_code\)[\s\S]*not valid/i);
  expect(migration).toMatch(/nullif\(btrim\(p_input->>'styleCode'\),''\) is null[\s\S]*raise exception 'STYLE_CODE_REQUIRED'/i);
});
```

- [ ] **Step 2: 运行定向测试并确认空货号仍被接受**

Run: `npm run test:ci -- src/lib/services/purchase.test.ts src/lib/style-code-migration.test.ts`  
Expected: FAIL，服务未报“请填写货号”且迁移文件不存在。

- [ ] **Step 3: 在服务层和 MemoryDbAdapter 强制校验货号**

```ts
export interface PurchaseFormInput {
  productName: string;
  styleCode: string;
  platform: Platform;
  unitPriceYuan: string;
  quantity: number;
  purchasedAt: string;
  size: string;
  initialStatus: UnitStatus;
  orderNo?: string;
  note?: string;
}

const styleCode = input.styleCode.trim();
if (!styleCode) throw new Error("请填写货号");
return db.createPurchase({
  productName,
  styleCode,
  platform: input.platform,
  unitPriceCents: parseYuanToCents(input.unitPriceYuan),
  quantity: input.quantity,
  purchasedAt: input.purchasedAt,
  size: input.size.trim(),
  initialStatus: input.initialStatus,
  orderNo: input.orderNo?.trim() ?? "",
  note: input.note?.trim() ?? "",
});
```

在 `MemoryDbAdapter.createPurchase` 的首次 mutation 之前加入：

```ts
const styleCode = input.styleCode.trim();
if (!styleCode) throw new Error("请填写货号");
```

并将产品匹配与写入统一改用 `styleCode`。所有既有测试采购 fixture 使用明确货号，如 `STYLE-001`、`STYLE-002`，不再用空字符串。

- [ ] **Step 4: 添加兼容历史数据的 0003 迁移**

```sql
begin;

alter table products
  add constraint products_style_code_nonblank
  check (style_code is not null and btrim(style_code) <> '') not valid;

create or replace function create_purchase_simple(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_product products;
  v_batch purchase_batches;
  v_unit inventory_units;
  v_ids jsonb := '[]'::jsonb;
  v_qty int;
  v_price bigint;
  v_status text;
  v_style_code text;
begin
  v_qty := (p_input->>'quantity')::int;
  v_price := (p_input->>'unitPriceCents')::bigint;
  v_status := p_input->>'initialStatus';
  v_style_code := nullif(btrim(p_input->>'styleCode'), '');
  if v_style_code is null then raise exception 'STYLE_CODE_REQUIRED'; end if;
  if v_qty < 1 or v_qty > 999 or v_price < 0 or v_status not in ('pending','arrived','shipping','in_stock_dewu','sold','settled','returned','refunded') then
    raise exception 'INVALID_PURCHASE';
  end if;
  select * into v_product from products
    where user_id = v_uid and lower(style_code) = lower(v_style_code)
    order by created_at, id limit 1;
  if v_product.id is null then
    insert into products(user_id,name,style_code)
      values(v_uid,trim(p_input->>'productName'),v_style_code)
      returning * into v_product;
  end if;
  insert into purchase_batches(user_id,product_id,platform,order_no,unit_price_cents,quantity,shipping_fee_cents,discount_amount_cents,purchased_at,note)
    values(v_uid,v_product.id,p_input->>'platform',nullif(trim(p_input->>'orderNo'),''),v_price,v_qty,0,0,(p_input->>'purchasedAt')::date,nullif(trim(p_input->>'note'),''))
    returning * into v_batch;
  for i in 1..v_qty loop
    insert into inventory_units(user_id,batch_id,product_id,size,unit_cost_cents,outbound_shipping_cents,status)
      values(v_uid,v_batch.id,v_product.id,trim(p_input->>'size'),v_price,0,v_status)
      returning * into v_unit;
    insert into status_history(user_id,unit_id,from_status,to_status,note)
      values(v_uid,v_unit.id,null,v_status,'采购入库');
    v_ids := v_ids || to_jsonb(v_unit.id::text);
  end loop;
  return jsonb_build_object('productId',v_product.id,'batchId',v_batch.id,'unitIds',v_ids);
end $$;

revoke all on function create_purchase_simple(jsonb) from public, anon;
grant execute on function create_purchase_simple(jsonb) to authenticated;
commit;
```

- [ ] **Step 5: 验证并提交货号规则**

Run: `npm run test:ci -- src/lib/services/purchase.test.ts src/lib/style-code-migration.test.ts src/lib/services/maintenance.test.ts src/lib/services/shipping.test.ts src/lib/reports.test.ts`  
Expected: PASS。  
Run: `npm run typecheck`  
Expected: PASS。  
Commit: `git add src/lib/services/purchase.ts src/lib/services/purchase.test.ts src/lib/data/memory.ts src/lib/style-code-migration.test.ts src/lib/services/maintenance.test.ts src/lib/services/shipping.test.ts src/lib/reports.test.ts supabase/migrations/0003_require_style_code.sql && git commit -m "feat: require purchase style codes"`

### Task 3: 新增页图片复用、替换与上传失败恢复

**Files:**
- Create: `src/components/add/PurchaseForm.tsx`
- Create: `src/components/add/PurchaseForm.test.tsx`
- Modify: `src/app/add/page.tsx`
- Reuse: `src/components/ui/ImagePicker.tsx`

**Interfaces:**
- Consumes: `findProductByStyleCode` and `loadProductImageUrls` from Task 1.
- Consumes: required `PurchaseFormInput.styleCode` from Task 2.
- Produces: `PurchaseForm({ dataSource?: DbAdapter, onComplete: () => void }): JSX.Element`.

- [ ] **Step 1: 写新增表单失败测试**

```tsx
it("marks style code required and blocks blank submission", async () => {
  const user = userEvent.setup();
  const db = new MemoryDbAdapter();
  render(<PurchaseForm dataSource={db} onComplete={vi.fn()} />);
  expect(screen.getByLabelText("货号（必填）")).toBeRequired();
  await user.type(screen.getByLabelText("品名"), "鞋");
  await user.type(screen.getByLabelText("尺码"), "42");
  await user.type(screen.getByLabelText("单件进价（元）"), "100");
  await user.click(screen.getByRole("button", { name: /保存并生成/ }));
  expect(await screen.findByText("请填写货号")).toBeInTheDocument();
});

it("shows and reuses the newest image for an existing style code", async () => {
  const db = new MemoryDbAdapter(seedWithTwoProductImages);
  render(<PurchaseForm dataSource={db} onComplete={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("货号（必填）"), " style-001 ");
  expect(await screen.findByText("该货号已有图片，将默认复用")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "STYLE-001 已有商品图片" })).toHaveAttribute("src", expect.stringContaining("new-image"));
});

it("can retry only the image after the purchase already succeeded", async () => {
  const db = new MemoryDbAdapter();
  const createSpy = vi.spyOn(db, "createPurchase");
  const saveSpy = vi.spyOn(db, "saveAttachment").mockRejectedValueOnce(new Error("upload failed"));
  render(<PurchaseForm dataSource={db} onComplete={vi.fn()} />);
  const user = userEvent.setup();
  await fillValidPurchaseFormAndChooseImage();
  await user.click(screen.getByRole("button", { name: /保存并生成/ }));
  expect(await screen.findByText("商品已保存，但图片上传失败")).toBeInTheDocument();
  expect(createSpy).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "重试上传图片" }));
  expect(createSpy).toHaveBeenCalledTimes(1);
  expect(saveSpy).toHaveBeenCalledTimes(2);
});
```

测试文件在 import 之后定义稳定 fixture 和图片选择 mock，避免依赖 canvas：

```tsx
vi.mock("@/components/ui/ImagePicker", () => ({
  default: ({ label, onChange }: { label: string; onChange: (blob: Blob) => void }) => (
    <button type="button" onClick={() => onChange(new Blob(["image"], { type: "image/jpeg" }))}>{label}</button>
  ),
}));

const seedWithTwoProductImages = {
  products: [{ id: "p1", user_id: "u", name: "鞋", style_code: "STYLE-001", brand: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" }],
  attachments: [
    { id: "a1", user_id: "u", owner_type: "product" as const, owner_id: "p1", kind: "product_image" as const, path: "old-image", content_type: "image/jpeg", created_at: "2026-08-01T00:00:00Z" },
    { id: "a2", user_id: "u", owner_type: "product" as const, owner_id: "p1", kind: "product_image" as const, path: "new-image", content_type: "image/jpeg", created_at: "2026-08-02T00:00:00Z" },
  ],
};

async function fillValidPurchaseFormAndChooseImage(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("品名"), "鞋");
  await user.type(screen.getByLabelText("货号（必填）"), "STYLE-001");
  await user.type(screen.getByLabelText("尺码"), "42");
  await user.type(screen.getByLabelText("单件进价（元）"), "100");
  await user.click(screen.getByRole("button", { name: /添加商品图片|选择新图片替换/ }));
}
```

- [ ] **Step 2: 运行组件测试并确认表单组件不存在**

Run: `npm run test:ci -- src/components/add/PurchaseForm.test.tsx`  
Expected: FAIL，提示无法解析 `PurchaseForm`。

- [ ] **Step 3: 提取表单并实现已有图片查询**

表单保持现有字段和 OCR sessionStorage 回填。货号输入使用 250ms effect，取消过期查询；核心查询为：

```ts
const products = await db.listProducts();
const product = findProductByStyleCode(products, form.styleCode);
if (!product) {
  setExistingImage(null);
  setImageLookupState("none");
  return;
}
const urls = await loadProductImageUrls(db, [product.id]);
const url = urls.get(product.id) ?? null;
setExistingImage(url);
setImageLookupState(url ? "found" : "none");
```

已有图片使用：

```tsx
{existingImage && (
  <div className="rounded-xl bg-background p-3">
    <img src={existingImage} alt={`${form.styleCode.trim()} 已有商品图片`} className="h-24 w-full rounded-lg object-cover" />
    <p className="mt-2 text-xs text-muted">该货号已有图片，将默认复用</p>
  </div>
)}
<ImagePicker label={existingImage ? "选择新图片替换" : "添加商品图片"} value={image} onChange={setImage} />
```

- [ ] **Step 4: 实现采购后上传、部分失败和只重试图片**

```ts
const result = await createPurchase(db, {
  ...form,
  unitPriceYuan: form.unitPrice,
  quantity: Number(form.quantity),
});
if (!image) {
  onComplete();
  return;
}
try {
  await db.saveAttachment({ file: image, owner_type: "product", owner_id: result.productId, kind: "product_image" });
  onComplete();
} catch {
  setSavedProductId(result.productId);
  setError("商品已保存，但图片上传失败");
  setSaving(false);
}

async function retryImage(): Promise<void> {
  if (!savedProductId || !image) return;
  setSaving(true);
  try {
    await db.saveAttachment({ file: image, owner_type: "product", owner_id: savedProductId, kind: "product_image" });
    onComplete();
  } catch (reason) {
    setError(reason instanceof Error ? `图片仍未上传：${reason.message}` : "图片仍未上传");
    setSaving(false);
  }
}
```

日期 input 和所有网格子项使用 `min-w-0 max-w-full w-full box-border`；`src/app/add/page.tsx` 只保留路由包装：

```tsx
export default function AddPage() {
  const router = useRouter();
  return <PurchaseForm onComplete={() => router.push("/inventory")} />;
}
```

- [ ] **Step 5: 验证并提交新增页**

Run: `npm run test:ci -- src/components/add/PurchaseForm.test.tsx src/lib/catalog.test.ts src/lib/services/purchase.test.ts`  
Expected: PASS。  
Run: `npm run typecheck && npm run lint`  
Expected: PASS。  
Commit: `git add src/app/add/page.tsx src/components/add/PurchaseForm.tsx src/components/add/PurchaseForm.test.tsx && git commit -m "feat: add reusable product images to purchases"`

### Task 4: 平台筛选与货号尺码分组模型

**Files:**
- Modify: `src/lib/utils/group.ts`
- Create: `src/lib/utils/group.test.ts`
- Modify: `src/components/ui/GroupCard.tsx`
- Create: `src/components/ui/GroupCard.test.tsx`
- Create: `src/test/inventory-fixtures.ts`

**Interfaces:**
- Consumes: `normalizeStyleCode` from Task 1.
- Produces: `PlatformFilter = Platform | "all"`.
- Produces: `filterUnitsByPlatform(units: UnitJoined[], filter: PlatformFilter): UnitJoined[]`.
- Produces: `buildGroups(units: UnitJoined[]): UnitGroup[]` where `UnitGroup` contains `styleCode`, `size`, `totalCostCents`, `platforms`, `statusCounts`, `units`.
- Produces: `groupQuery(group: UnitGroup, platform: PlatformFilter): string`.
- Produces: `matchesGroup(unit: UnitJoined, query: GroupSelection): boolean`.
- Produces for tests: `makeJoinedUnit(overrides): UnitJoined` and `makeInventorySeed(): Partial<MemoryState>`.

- [ ] **Step 1: 写筛选、合并、历史空货号和 query 失败测试**

```ts
it("filters platform before grouping style and size", () => {
  const units = [
    makeJoinedUnit({ id: "u1", styleCode: " AB-1 ", size: "42", platform: "taobao", cost: 100, status: "arrived" }),
    makeJoinedUnit({ id: "u2", styleCode: "ab-1", size: "42 ", platform: "taobao", cost: 200, status: "shipping" }),
    makeJoinedUnit({ id: "u3", styleCode: "AB-1", size: "42", platform: "pdd", cost: 300, status: "pending" }),
  ];
  const taobao = buildGroups(filterUnitsByPlatform(units, "taobao"));
  expect(taobao).toHaveLength(1);
  expect(taobao[0].units.map((unit) => unit.id)).toEqual(["u1", "u2"]);
  expect(taobao[0].totalCostCents).toBe(300);
  expect(taobao[0].statusCounts).toEqual({ arrived: 1, shipping: 1 });
  expect(buildGroups(units)[0].units).toHaveLength(3);
});

it("does not merge unrelated historical products with blank style codes", () => {
  const groups = buildGroups([
    makeJoinedUnit({ id: "u1", productId: "p1", styleCode: null, size: "42" }),
    makeJoinedUnit({ id: "u2", productId: "p2", styleCode: null, size: "42" }),
  ]);
  expect(groups).toHaveLength(2);
});

it("round-trips style size and optional platform through group matching", () => {
  const group = buildGroups([makeJoinedUnit({ styleCode: "AB/1", size: "42.5", platform: "pdd" })])[0];
  expect(groupQuery(group, "pdd")).toBe("style=AB%2F1&size=42.5&platform=pdd");
  expect(matchesGroup(group.units[0], { styleCode: "AB/1", productId: null, size: "42.5", platform: "pdd" })).toBe(true);
});
```

`src/test/inventory-fixtures.ts` 定义完整且可跨组件测试复用的工厂：

```ts
export function makeJoinedUnit(overrides: {
  id?: string; productId?: string; styleCode?: string | null; size?: string;
  platform?: Platform; cost?: number; status?: UnitStatus;
} = {}): UnitJoined {
  const id = overrides.id ?? "u1";
  const productId = overrides.productId ?? "p1";
  const timestamp = "2026-08-01T00:00:00Z";
  return {
    id, user_id: "u", product_id: productId, batch_id: `b-${id}`,
    size: overrides.size ?? "42", unit_cost_cents: overrides.cost ?? 10000,
    listing_price_cents: null, outbound_shipping_cents: 0,
    status: overrides.status ?? "arrived", created_at: timestamp, updated_at: timestamp,
    product: { id: productId, user_id: "u", name: "测试鞋", style_code: overrides.styleCode === undefined ? "AB-1" : overrides.styleCode, brand: null, created_at: timestamp, updated_at: timestamp },
    batch: { id: `b-${id}`, user_id: "u", product_id: productId, platform: overrides.platform ?? "taobao", order_no: null, unit_price_cents: overrides.cost ?? 10000, quantity: 1, shipping_fee_cents: 0, discount_amount_cents: 0, purchased_at: "2026-08-01", note: null, created_at: timestamp, updated_at: timestamp },
    sale: null,
  };
}

export function makeInventorySeed(): Partial<MemoryState> {
  const joined = [
    makeJoinedUnit({ id: "u1", productId: "p1", styleCode: "AB-1", platform: "taobao", cost: 10000, status: "arrived" }),
    makeJoinedUnit({ id: "u2", productId: "p1", styleCode: "AB-1", platform: "taobao", cost: 11000, status: "shipping" }),
    makeJoinedUnit({ id: "u3", productId: "p1", styleCode: "AB-1", platform: "pdd", cost: 12000, status: "pending" }),
  ];
  return {
    products: [joined[0].product],
    batches: joined.map((unit) => unit.batch),
    units: joined.map(({ product: _product, batch: _batch, sale: _sale, ...unit }) => unit),
  };
}
```

- [ ] **Step 2: 运行分组测试并确认旧规则产生错误分组**

Run: `npm run test:ci -- src/lib/utils/group.test.ts src/components/ui/GroupCard.test.tsx`  
Expected: FAIL，旧模型仍按 product/cost/status 分组。

- [ ] **Step 3: 实现先筛选再分组的纯函数**

```ts
export type PlatformFilter = Platform | "all";
export interface UnitGroup {
  key: string;
  product: UnitJoined["product"];
  styleCode: string | null;
  size: string;
  totalCostCents: number;
  platforms: Platform[];
  statusCounts: Partial<Record<UnitStatus, number>>;
  units: UnitJoined[];
}

export function filterUnitsByPlatform(units: UnitJoined[], filter: PlatformFilter): UnitJoined[] {
  return filter === "all" ? units : units.filter((unit) => unit.batch.platform === filter);
}

function identity(unit: UnitJoined): string {
  return normalizeStyleCode(unit.product.style_code) || `legacy-product:${unit.product_id}`;
}

export function groupKey(unit: UnitJoined): string {
  return `${identity(unit)}|${unit.size.trim().toLocaleLowerCase()}`;
}
```

`buildGroups` 首次见到 key 时创建组；以后累加 `totalCostCents`、去重并按 `PLATFORMS` 顺序排列 `platforms`、递增 `statusCounts`，不再比较成本、状态或批次。

- [ ] **Step 4: 改造分组卡片展示约定字段**

`GroupCard` 改为接收：

```ts
{
  group: UnitGroup;
  imageUrl: string | null;
  platformFilter: PlatformFilter;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}
```

卡片显示 `×N`、`成本合计 ${formatCents(group.totalCostCents)}`、平台标签和由 `STATUS_META` 生成的 `状态 N` 文本；普通模式使用 `<Link href={`/inventory/group?${groupQuery(group, platformFilter)}`}>`，批量模式使用 button 调用 `onToggle`，避免点击时跳转。

- [ ] **Step 5: 验证并提交分组模型与卡片**

Run: `npm run test:ci -- src/lib/utils/group.test.ts src/components/ui/GroupCard.test.tsx`  
Expected: PASS。  
Run: `npm run typecheck`  
Expected: PASS。  
Commit: `git add src/lib/utils/group.ts src/lib/utils/group.test.ts src/components/ui/GroupCard.tsx src/components/ui/GroupCard.test.tsx src/test/inventory-fixtures.ts && git commit -m "feat: group inventory by style and size"`

### Task 5: 库存页平台筛选、图片和组内明细

**Files:**
- Modify: `src/app/inventory/page.tsx`
- Create: `src/app/inventory/page.test.tsx`
- Modify: `src/app/inventory/group/page.tsx`
- Create: `src/app/inventory/group/page.test.tsx`

**Interfaces:**
- Consumes: `loadProductImageUrls` from Task 1.
- Consumes: all group interfaces from Task 4.
- Changes: `InventoryPage({ dataSource?: DbAdapter } = {})` for deterministic component tests.
- Changes: `InventoryGroupPage({ dataSource?: DbAdapter, initialQuery?: GroupSelection } = {})` wrapper with Suspense; production reads URL params when `initialQuery` is absent.

- [ ] **Step 1: 写库存筛选、分组选择和组内明细失败测试**

```tsx
it("shows only platforms present in data and filters before grouping", async () => {
  render(<InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />);
  expect(await screen.findByText("×3")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "淘宝" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "拼多多" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "京东" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "淘宝" }));
  expect(screen.getByText("×2")).toBeInTheDocument();
});

it("selecting a group selects every underlying unit", async () => {
  render(<InventoryPage dataSource={new MemoryDbAdapter(makeInventorySeed())} />);
  await screen.findByText("×3");
  await userEvent.click(screen.getByRole("button", { name: "批量" }));
  await userEvent.click(screen.getByRole("button", { name: /选择 AB-1 42/ }));
  expect(screen.getByText("已选 3 件")).toBeInTheDocument();
});

it("group detail lists differing platform cost and status", async () => {
  render(<InventoryGroupPage dataSource={new MemoryDbAdapter(makeInventorySeed())} initialQuery={{ styleCode: "AB-1", productId: null, size: "42", platform: null }} />);
  expect(await screen.findByText("淘宝 · ¥100.00 · 已到货")).toBeInTheDocument();
  expect(screen.getByText("淘宝 · ¥110.00 · 发往得物途中")).toBeInTheDocument();
  expect(screen.getByText("拼多多 · ¥120.00 · 未到货")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行页面测试并确认仍逐件展示**

Run: `npm run test:ci -- src/app/inventory/page.test.tsx src/app/inventory/group/page.test.tsx`  
Expected: FAIL，库存页没有平台按钮且仍渲染 `UnitCard`。

- [ ] **Step 3: 库存加载时一次拼接数据和解析图片**

```ts
const [raw, products, batches, sales] = await Promise.all([
  db.listUnits(), db.listProducts(), db.listBatches(), db.listSales(),
]);
const productMap = new Map(products.map((product) => [product.id, product]));
const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
const saleMap = new Map(sales.map((sale) => [sale.unit_id, sale]));
const joined = raw.flatMap((unit): UnitJoined[] => {
  const product = productMap.get(unit.product_id);
  const batch = batchMap.get(unit.batch_id);
  return product && batch ? [{ ...unit, product, batch, sale: saleMap.get(unit.id) ?? null }] : [];
});
const urls = await loadProductImageUrls(db, new Set(joined.map((unit) => unit.product_id)));
setUnits(joined);
setImageUrls(urls);
```

签名失败由 Task 1 隔离，库存仍进入 loaded 状态并展示占位图。

- [ ] **Step 4: 接入动态平台按钮、分组卡片和组级批量选择**

```ts
const availablePlatforms = PLATFORMS.filter((option) =>
  units.some((unit) => unit.batch.platform === option.value),
);
const visibleUnits = filterUnitsByPlatform(units, platformFilter);
const groups = buildGroups(visibleUnits);

function toggleGroup(group: UnitGroup): void {
  setSelected((old) => {
    const next = new Set(old);
    const allSelected = group.units.every((unit) => next.has(unit.id));
    for (const unit of group.units) allSelected ? next.delete(unit.id) : next.add(unit.id);
    return next;
  });
}
```

切换平台时清空隐藏选择；空结果文案为“该平台暂无库存”。图片使用组代表商品的 `imageUrls.get(group.product.id) ?? null`。

组内页解析 `style`、`product`、`size`、`platform`，通过 `matchesGroup` 过滤；顶部显示数量和成本合计，每行固定展示 `${PLATFORM_LABELS[platform]} · ${formatCents(cost)} · ${STATUS_META[status].label}`，保留查看单件和删除一件操作。

- [ ] **Step 5: 验证并提交库存页面**

Run: `npm run test:ci -- src/app/inventory/page.test.tsx src/app/inventory/group/page.test.tsx src/lib/utils/group.test.ts src/components/ui/GroupCard.test.tsx`  
Expected: PASS。  
Run: `npm run typecheck && npm run lint`  
Expected: PASS。  
Commit: `git add src/app/inventory/page.tsx src/app/inventory/page.test.tsx src/app/inventory/group/page.tsx src/app/inventory/group/page.test.tsx && git commit -m "feat: filter and merge inventory cards"`

### Task 6: 首页四项指标

**Files:**
- Create: `src/lib/home-summary.ts`
- Create: `src/lib/home-summary.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Produces: `buildHomeSummary(units: InventoryUnit[], sales: Sale[], now: Date): HomeSummary`.
- Produces: `HomeSummary = { inventoryCount: number; inventoryCostCents: number; month: string; monthLabel: string; monthlySalesCount: number; monthlyProfitCents: number }`.

- [ ] **Step 1: 写跨月、退款和库存状态失败测试**

```ts
it("builds active inventory and current settled month metrics", () => {
  const summary = buildHomeSummary(
    [
      makeUnit("active", "arrived", 10000, 0),
      makeUnit("aug", "settled", 8000, 500),
      makeUnit("jul", "settled", 7000, 0),
      makeUnit("refund", "refunded", 9000, 0),
    ],
    [
      makeSale("aug", 12000, "2026-08-03"),
      makeSale("jul", 10000, "2026-07-31"),
      makeSale("refund", 20000, "2026-08-02"),
    ],
    new Date("2026-08-04T12:00:00+02:00"),
  );
  expect(summary).toEqual({
    inventoryCount: 1,
    inventoryCostCents: 10000,
    month: "2026-08",
    monthLabel: "8月",
    monthlySalesCount: 1,
    monthlyProfitCents: 3500,
  });
});
```

测试文件内定义完整行工厂：

```ts
const timestamp = "2026-08-01T00:00:00Z";
function makeUnit(id: string, status: UnitStatus, cost: number, shipping: number): InventoryUnit {
  return { id, user_id: "u", batch_id: `b-${id}`, product_id: `p-${id}`, size: "42", unit_cost_cents: cost, listing_price_cents: null, outbound_shipping_cents: shipping, status, created_at: timestamp, updated_at: timestamp };
}
function makeSale(unitId: string, payout: number, settledAt: string): Sale {
  return { id: `s-${unitId}`, user_id: "u", unit_id: unitId, sold_price_cents: 0, platform_fee_cents: 0, platform_subsidy_cents: 0, express_fee_cents: 0, other_fee_cents: 0, actual_payout_cents: payout, sold_at: settledAt, settled_at: settledAt, created_at: timestamp, updated_at: timestamp };
}
```

组件测试同时断言存在“库存数量”“库存成本”“8月销量”“8月利润”，不存在“有效库存”“库存资金”“未结算”“利润唯一口径”。

- [ ] **Step 2: 运行首页测试并确认旧标签和累计利润导致失败**

Run: `npm run test:ci -- src/lib/home-summary.test.ts src/app/page.test.tsx`  
Expected: FAIL，`home-summary` 不存在且页面仍显示旧指标。

- [ ] **Step 3: 实现纯统计函数**

```ts
export function buildHomeSummary(units: InventoryUnit[], sales: Sale[], now: Date): HomeSummary {
  const month = monthKey(now);
  const validUnits = units.filter((unit) => unit.status !== "refunded");
  const unitMap = new Map(validUnits.map((unit) => [unit.id, unit]));
  const settled = sales.flatMap((sale) => {
    if (!sale.settled_at?.startsWith(month) || sale.actual_payout_cents == null) return [];
    const unit = unitMap.get(sale.unit_id);
    const profit = unit ? actualProfitCents(unit.unit_cost_cents, unit.outbound_shipping_cents, sale.actual_payout_cents) : null;
    return unit && profit != null ? [{ profit }] : [];
  });
  const active = validUnits.filter((unit) => ACTIVE_STATUSES.includes(unit.status));
  return {
    inventoryCount: active.length,
    inventoryCostCents: active.reduce((sum, unit) => sum + unit.unit_cost_cents, 0),
    month,
    monthLabel: `${Number(month.slice(5))}月`,
    monthlySalesCount: settled.length,
    monthlyProfitCents: settled.reduce((sum, row) => sum + row.profit, 0),
  };
}
```

- [ ] **Step 4: 首页只渲染四张新卡片**

`HomePage` 增加可选 `now?: Date` 测试注入，并用纯函数设 state。四个 Stat 标签和值固定为：

```tsx
<Stat label="库存数量" value={data ? String(data.inventoryCount) : "…"} hint="件" />
<Stat label="库存成本" value={data ? formatCents(data.inventoryCostCents) : "…"} hint="按单件进价" />
<Stat label={`${data?.monthLabel ?? currentMonthLabel}销量`} value={data ? String(data.monthlySalesCount) : "…"} hint="已结算" />
<Stat label={`${data?.monthLabel ?? currentMonthLabel}利润`} value={data ? formatCents(data.monthlyProfitCents) : "…"} hint="实际到账口径" />
```

删除页面底部利润提示 Card。

- [ ] **Step 5: 验证并提交首页指标**

Run: `npm run test:ci -- src/lib/home-summary.test.ts src/app/page.test.tsx`  
Expected: PASS。  
Run: `npm run typecheck`  
Expected: PASS。  
Commit: `git add src/lib/home-summary.ts src/lib/home-summary.test.ts src/app/page.tsx src/app/page.test.tsx && git commit -m "feat: show monthly home metrics"`

### Task 7: 历史累计与月度结算报表

**Files:**
- Modify: `src/lib/reports.ts`
- Modify: `src/lib/reports.test.ts`
- Modify: `src/app/reports/page.tsx`
- Create: `src/app/reports/page.test.tsx`

**Interfaces:**
- Produces: `SettlementSummary = { profitCents: number; salesCents: number; salesCount: number }`.
- Produces: `SettlementReport = { allTime: SettlementSummary; selectedMonth: SettlementSummary; rows: ReportRow[] }`.
- Produces: `ReportInput = { units: InventoryUnit[]; products: Product[]; batches: PurchaseBatch[]; sales: Sale[]; month: string }`.
- Produces: `buildSettlementReport({ units, products, batches, sales, month }): SettlementReport`.
- Changes: `buildCsv(report: SettlementReport, month: string): string`.

- [ ] **Step 1: 写历史累计、月份、退款和 CSV 失败测试**

```ts
it("separates all-time and selected-month settled totals", () => {
  const report = buildSettlementReport(makeReportInput("2026-08"));
  expect(report.allTime).toEqual({ profitCents: 8500, salesCents: 24000, salesCount: 2 });
  expect(report.selectedMonth).toEqual({ profitCents: 3500, salesCents: 12000, salesCount: 1 });
});

it("excludes refunded, unsettled and missing-payout rows", () => {
  const input = makeReportInput("2026-08");
  input.units.forEach((unit) => { unit.status = "refunded"; });
  input.sales.forEach((sale) => { sale.actual_payout_cents = null; });
  const report = buildSettlementReport(input);
  expect(report.allTime.salesCount).toBe(0);
  expect(report.allTime.salesCents).toBe(0);
  expect(report.allTime.profitCents).toBe(0);
});

it("exports both summary scopes and selected-month detail", () => {
  const csv = buildCsv(report, "2026-08");
  expect(csv).toContain("范围,利润(分),销售额(分),销量");
  expect(csv).toContain("历史累计,8500,24000,2");
  expect(csv).toContain("2026-08,3500,12000,1");
});
```

测试文件定义 `makeReportInput`，用两件有效结算构成期望值，一件在 8 月、一件在 7 月：

```ts
function makeReportInput(month: string): ReportInput {
  const timestamp = "2026-07-01T00:00:00Z";
  const products = [{ id: "p", user_id: "u", name: "鞋", style_code: "STYLE-001", brand: null, created_at: timestamp, updated_at: timestamp }];
  const batches = [
    { id: "b1", user_id: "u", product_id: "p", platform: "taobao" as const, order_no: null, unit_price_cents: 8000, quantity: 1, shipping_fee_cents: 0, discount_amount_cents: 0, purchased_at: "2026-08-01", note: null, created_at: timestamp, updated_at: timestamp },
    { id: "b2", user_id: "u", product_id: "p", platform: "pdd" as const, order_no: null, unit_price_cents: 7000, quantity: 1, shipping_fee_cents: 0, discount_amount_cents: 0, purchased_at: "2026-07-01", note: null, created_at: timestamp, updated_at: timestamp },
  ];
  const units = [
    { id: "u1", user_id: "u", product_id: "p", batch_id: "b1", size: "42", unit_cost_cents: 8000, listing_price_cents: null, outbound_shipping_cents: 500, status: "settled" as const, created_at: timestamp, updated_at: timestamp },
    { id: "u2", user_id: "u", product_id: "p", batch_id: "b2", size: "42", unit_cost_cents: 7000, listing_price_cents: null, outbound_shipping_cents: 0, status: "settled" as const, created_at: timestamp, updated_at: timestamp },
  ];
  const sale = (id: string, unitId: string, payout: number, date: string): Sale => ({ id, user_id: "u", unit_id: unitId, sold_price_cents: 0, platform_fee_cents: 0, platform_subsidy_cents: 0, express_fee_cents: 0, other_fee_cents: 0, actual_payout_cents: payout, sold_at: date, settled_at: date, created_at: timestamp, updated_at: timestamp });
  return { units, products, batches, sales: [sale("s1", "u1", 12000, "2026-08-03"), sale("s2", "u2", 12000, "2026-07-31")], month };
}
```

页面测试断言累计与月度各有“利润、销售额、销量”，切换月份只改变月度区域，且页面不存在“当前有效库存资金”。

- [ ] **Step 2: 运行报表测试并确认缺少累计统计**

Run: `npm run test:ci -- src/lib/reports.test.ts src/app/reports/page.test.tsx`  
Expected: FAIL，旧 `MonthlyReport` 只有单月统计且含库存成本。

- [ ] **Step 3: 实现固定结算口径的报表构建器**

```ts
function summarize(rows: ReportRow[]): SettlementSummary {
  return {
    profitCents: rows.reduce((sum, row) => sum + row.profit, 0),
    salesCents: rows.reduce((sum, row) => sum + (row.sale.actual_payout_cents ?? 0), 0),
    salesCount: rows.length,
  };
}

export function buildSettlementReport(input: ReportInput): SettlementReport {
  const unitMap = new Map(input.units.filter((unit) => unit.status !== "refunded").map((unit) => [unit.id, unit]));
  const productMap = new Map(input.products.map((product) => [product.id, product]));
  const batchMap = new Map(input.batches.map((batch) => [batch.id, batch]));
  const allRows = input.sales.flatMap((sale): ReportRow[] => {
    if (!sale.settled_at || sale.actual_payout_cents == null) return [];
    const unit = unitMap.get(sale.unit_id);
    const product = unit ? productMap.get(unit.product_id) : undefined;
    const batch = unit ? batchMap.get(unit.batch_id) : undefined;
    const profit = unit ? actualProfitCents(unit.unit_cost_cents, unit.outbound_shipping_cents, sale.actual_payout_cents) : null;
    return unit && product && batch && profit != null ? [{ unit, sale, product, batch, profit }] : [];
  });
  const rows = allRows.filter((row) => row.sale.settled_at?.startsWith(input.month));
  return { allTime: summarize(allRows), selectedMonth: summarize(rows), rows };
}
```

CSV 先写三列摘要头和两行摘要，再空一行，再写所选月的逐件明细；日期固定使用 `settled_at`，不再接收 `basis`。

- [ ] **Step 4: 改造报表页面**

页面结构固定为：历史累计 Card（三项）、月份 input、`${Number(month.slice(5))}月` Card（三项）、CSV 按钮。三项的标签和值为：

```tsx
<Stat label="总利润" value={formatCents(report.allTime.profitCents)} />
<Stat label="总销售额" value={formatCents(report.allTime.salesCents)} />
<Stat label="总销量" value={String(report.allTime.salesCount)} />
<Stat label="利润" value={formatCents(report.selectedMonth.profitCents)} />
<Stat label="销售额" value={formatCents(report.selectedMonth.salesCents)} />
<Stat label="销量" value={String(report.selectedMonth.salesCount)} />
```

`ReportsPage` 增加可选 `dataSource?: DbAdapter` 便于组件测试；下载文件名保持 `报表-${month}.csv`。

- [ ] **Step 5: 验证并提交报表**

Run: `npm run test:ci -- src/lib/reports.test.ts src/app/reports/page.test.tsx`  
Expected: PASS。  
Run: `npm run typecheck && npm run lint`  
Expected: PASS。  
Commit: `git add src/lib/reports.ts src/lib/reports.test.ts src/app/reports/page.tsx src/app/reports/page.test.tsx && git commit -m "feat: add lifetime and monthly sales reports"`

### Task 8: 移动端、迁移、文档与 GitHub Pages 验收

**Files:**
- Modify: `e2e/simple-flow.spec.ts`
- Modify: `README.md`
- Modify: `HANDOFF.md`
- Modify: `docs/qa-report-simple.md`
- Verify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: all completed page and migration behavior.
- Produces: reproducible 390px overflow check and deployment evidence.

- [ ] **Step 1: 写带本地伪会话的 390px 新增页浏览器测试**

```ts
test("390px add form keeps the purchase date inside the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6InRlc3QtdXNlciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.signature",
      refresh_token: "test-refresh-token",
      expires_at: 4102444800,
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "test-user", aud: "authenticated", role: "authenticated", email: "test@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-08-01T00:00:00Z" },
    }));
  });
  await page.goto("/add/");
  const date = page.getByLabel("采购日期");
  await expect(date).toBeVisible();
  const bounds = await date.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(374);
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
```

如果 Supabase SDK 校验伪 JWT 并触发 `/auth/v1/user`，测试增加以下固定 mock；不得在测试中写入真实 token：

```ts
await page.route("**/auth/v1/user", (route) => route.fulfill({
  json: { id: "test-user", aud: "authenticated", role: "authenticated", email: "test@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-08-01T00:00:00Z" },
}));
```

- [ ] **Step 2: 更新运行和迁移文档**

README 的迁移顺序改为 `0001_init.sql` → `0002_simple_secure.sql` → `0003_require_style_code.sql`，业务口径增加：货号必填、商品图为私有附件、库存按平台后按货号尺码合并、报表按实际结算。HANDOFF 和 QA 文档记录新页面行为、图片上传部分失败的恢复方式、iPhone 390px 结果及不包含的 OCR/挂牌价范围。

- [ ] **Step 3: 执行完整本地质量门**

Run: `npm run typecheck`  
Expected: exit 0。  
Run: `npm run lint`  
Expected: exit 0。  
Run: `npm run test:ci`  
Expected: 全部测试 PASS。  
Run: `npm run build`  
Expected: 静态导出到 `out/`，`/add/`、`/inventory/`、`/inventory/group/`、`/reports/` 均生成。  
Run: `npm run verify:export`  
Expected: exit 0，无根路径资源泄漏。  
Run: `npm run e2e`  
Expected: 390px 日期与页面宽度检查 PASS。

- [ ] **Step 4: 应用 0003 并做真实 Supabase 冒烟验收**

在目标 Supabase 项目只执行已提交的 `supabase/migrations/0003_require_style_code.sql`，不执行 `0002` 的 truncate。验证：空货号 RPC 返回 `STYLE_CODE_REQUIRED`；同一货号第二次采购复用同一 product；上传新图后 attachments 最新行可签名读取；不在日志和文档记录数据库密码或会话 token。

- [ ] **Step 5: 提交文档与浏览器测试并推送部署分支**

Commit: `git add e2e/simple-flow.spec.ts README.md HANDOFF.md docs/qa-report-simple.md && git commit -m "docs: verify inventory reporting release"`  
Run: `git diff --check && git status --short`  
Expected: 无未提交改动。  
Run: `git push origin agent/supabase-backup-offline`  
Expected: 推送成功并触发 `.github/workflows/deploy-pages.yml`。

- [ ] **Step 6: 验证 GitHub Actions 与公开 PWA**

确认最新 Pages workflow 的 typecheck、test、build、verify-export 和 deploy 全部成功。打开 `https://dlxdjj.github.io/dewu-/`，用目标账号验证：首页四项指标、添加页货号/图片、库存平台筛选/合并、组内明细、报表历史/月度指标和 CSV；最后强制刷新一次确认静态资源与 base path 正常。
