-- ============================================================
-- dewu-pms 初始化迁移（单租户 · 个人使用 · 无登录）
-- 在 Supabase SQL Editor 执行一次即可。
--
-- 安全说明：RLS 策略对 anon 角色全量放开，前提是不公开部署地址、
-- 不泄露 anon key。如未来多人使用，需加 user_id 字段并改用 auth 策略。
-- ============================================================

create extension if not exists pgcrypto;

-- ① 商品资料表（同一货号只录一次，库存挂在它下面）
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- 品名
  style_code  text,                      -- 货号
  brand       text,                      -- 品牌（可选）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ② 采购批次表（一次下单 = 一个批次）
create table purchase_batches (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id),
  platform        text not null,         -- taobao/jd/pdd/vipshop/other
  order_no        text,                  -- 采购平台订单号
  unit_price      numeric(10,2) not null,-- 采购单价
  quantity        integer not null check (quantity > 0),
  shipping_fee    numeric(10,2) not null default 0,  -- 采购运费（整批）
  discount_amount numeric(10,2) not null default 0,  -- 优惠金额（整批）
  purchased_at    date not null,         -- 采购日期
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ③ 单件库存表（核心：每件都有独立 id，同批 5 件也是 5 行）
create table inventory_units (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references purchase_batches(id),
  product_id    uuid not null references products(id),
  size          text not null,           -- 尺码
  unit_cost     numeric(10,2) not null,  -- 分摊后采购成本 = 单价 + (运费-优惠)/数量
  listing_price numeric(10,2),           -- 得物挂牌价（可选，用于仓内货值）
  status        text not null default 'pending' check (status in (
                  'pending',        -- 未到货
                  'arrived',        -- 已到货
                  'shipping',       -- 发往得物途中
                  'in_stock_dewu',  -- 已到得物仓未售出
                  'sold',           -- 已售出待结算
                  'settled',        -- 已结算
                  'returned',       -- 退回
                  'refunded'        -- 退款
                )),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ④ 销售记录表（与单件一对一）
create table sales (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null unique references inventory_units(id),
  sold_price      numeric(10,2),         -- 得物售价
  platform_fee    numeric(10,2) not null default 0,  -- 平台费用
  platform_subsidy numeric(10,2) not null default 0, -- 平台补贴
  express_fee     numeric(10,2) not null default 0,  -- 发往得物快递费
  other_fee       numeric(10,2) not null default 0,  -- 其他销售费用
  actual_payout   numeric(10,2),         -- 实际到账金额
  sold_at         date,                  -- 售出日期
  settled_at      date,                  -- 结算日期
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ⑤ 图片附件表（商品图、采购订单截图等）
create table attachments (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null check (owner_type in ('product','batch','unit','sale')),
  owner_id     uuid not null,
  kind         text not null default 'image',  -- product_image / order_screenshot
  path         text not null,                  -- Storage 路径；本地实现为 local:<id>
  content_type text,
  created_at   timestamptz not null default now()
);

-- ⑥ 状态变更记录表（每次改状态自动写入）
create table status_history (
  id          bigint generated always as identity primary key,
  unit_id     uuid not null references inventory_units(id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- updated_at 自动维护
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_products_updated  before update on products
  for each row execute function set_updated_at();
create trigger trg_batches_updated   before update on purchase_batches
  for each row execute function set_updated_at();
create trigger trg_units_updated     before update on inventory_units
  for each row execute function set_updated_at();
create trigger trg_sales_updated     before update on sales
  for each row execute function set_updated_at();

-- 索引
create index idx_batches_product      on purchase_batches(product_id);
create index idx_batches_purchased_at on purchase_batches(purchased_at);
create index idx_units_batch          on inventory_units(batch_id);
create index idx_units_product        on inventory_units(product_id);
create index idx_units_status         on inventory_units(status);
create index idx_sales_sold_at        on sales(sold_at);
create index idx_sales_settled_at     on sales(settled_at);
create index idx_attachments_owner    on attachments(owner_type, owner_id);
create index idx_status_history_unit  on status_history(unit_id);

-- 单租户 RLS：anon 全量放开（切勿公开部署地址）
alter table products         enable row level security;
alter table purchase_batches enable row level security;
alter table inventory_units  enable row level security;
alter table sales            enable row level security;
alter table attachments      enable row level security;
alter table status_history   enable row level security;

create policy "anon all" on products         for all to anon using (true) with check (true);
create policy "anon all" on purchase_batches for all to anon using (true) with check (true);
create policy "anon all" on inventory_units  for all to anon using (true) with check (true);
create policy "anon all" on sales            for all to anon using (true) with check (true);
create policy "anon all" on attachments      for all to anon using (true) with check (true);
create policy "anon all" on status_history   for all to anon using (true) with check (true);

-- Storage：图片附件 bucket（公开读）
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true);

create policy "anon read attachments"   on storage.objects for select to anon
  using (bucket_id = 'attachments');
create policy "anon write attachments"  on storage.objects for insert to anon
  with check (bucket_id = 'attachments');
create policy "anon update attachments" on storage.objects for update to anon
  using (bucket_id = 'attachments');
create policy "anon delete attachments" on storage.objects for delete to anon
  using (bucket_id = 'attachments');
