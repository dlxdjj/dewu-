-- Monthly affiliate rebates and single-item shipping semantics.
begin;

create table monthly_rebates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  source text not null check (source in ('taobao_alliance','jingfen')),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month, source)
);

create index idx_monthly_rebates_user_month
  on monthly_rebates(user_id, month desc);

create trigger trg_monthly_rebates_updated
  before update on monthly_rebates
  for each row execute function set_updated_at();

alter table monthly_rebates enable row level security;
create policy "owned read" on monthly_rebates
  for select to authenticated using (user_id = auth.uid());
revoke all on monthly_rebates from anon, authenticated;
grant select on monthly_rebates to authenticated;

-- New purchases cannot enter shipping without going through ship_units.
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
  v_product_name text;
  v_size text;
  v_platform text;
begin
  v_qty := (p_input->>'quantity')::int;
  v_price := (p_input->>'unitPriceCents')::bigint;
  v_status := p_input->>'initialStatus';
  v_style_code := nullif(btrim(p_input->>'styleCode'), '');
  v_product_name := nullif(btrim(p_input->>'productName'), '');
  v_size := nullif(btrim(p_input->>'size'), '');
  v_platform := p_input->>'platform';

  if v_style_code is null then
    raise exception 'STYLE_CODE_REQUIRED';
  end if;
  if v_product_name is null or v_size is null then
    raise exception 'INVALID_PURCHASE';
  end if;
  if v_qty < 1 or v_qty > 999 or v_price < 0 then
    raise exception 'INVALID_PURCHASE';
  end if;
  if v_platform not in ('taobao','jd','pdd','vipshop','other') then
    raise exception 'INVALID_PURCHASE';
  end if;
  if v_status not in ('pending','arrived','in_stock_dewu','returned') then
    raise exception 'INVALID_INITIAL_STATUS';
  end if;

  select * into v_product
  from products
  where user_id = v_uid and lower(style_code) = lower(v_style_code)
  order by created_at, id
  limit 1;

  if v_product.id is null then
    insert into products(user_id,name,style_code)
    values(v_uid,v_product_name,v_style_code)
    returning * into v_product;
  end if;

  insert into purchase_batches(
    user_id,product_id,platform,order_no,unit_price_cents,quantity,
    shipping_fee_cents,discount_amount_cents,purchased_at,note
  ) values (
    v_uid,v_product.id,v_platform,nullif(btrim(p_input->>'orderNo'),''),
    v_price,v_qty,0,0,(p_input->>'purchasedAt')::date,
    nullif(btrim(p_input->>'note'),'')
  ) returning * into v_batch;

  for i in 1..v_qty loop
    insert into inventory_units(
      user_id,batch_id,product_id,size,unit_cost_cents,
      outbound_shipping_cents,status
    ) values (
      v_uid,v_batch.id,v_product.id,v_size,v_price,0,v_status
    ) returning * into v_unit;
    insert into status_history(user_id,unit_id,from_status,to_status,note)
    values(v_uid,v_unit.id,null,v_status,'采购入库');
    v_ids := v_ids || to_jsonb(v_unit.id::text);
  end loop;

  return jsonb_build_object(
    'productId',v_product.id,
    'batchId',v_batch.id,
    'unitIds',v_ids
  );
end $$;

create or replace function save_monthly_rebates(
  p_month date,
  p_taobao_alliance_cents bigint,
  p_jingfen_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_taobao monthly_rebates;
  v_jingfen monthly_rebates;
begin
  if p_month is null
    or extract(day from p_month) <> 1
    or p_taobao_alliance_cents is null
    or p_jingfen_cents is null
    or p_taobao_alliance_cents < 0
    or p_jingfen_cents < 0 then
    raise exception 'INVALID_REBATE';
  end if;

  insert into monthly_rebates(user_id,month,source,amount_cents)
  values(v_uid,p_month,'taobao_alliance',p_taobao_alliance_cents)
  on conflict(user_id,month,source) do update set
    amount_cents = excluded.amount_cents
  returning * into v_taobao;

  insert into monthly_rebates(user_id,month,source,amount_cents)
  values(v_uid,p_month,'jingfen',p_jingfen_cents)
  on conflict(user_id,month,source) do update set
    amount_cents = excluded.amount_cents
  returning * into v_jingfen;

  return jsonb_build_array(to_jsonb(v_taobao),to_jsonb(v_jingfen));
end $$;

-- Generic status changes cannot bypass the dedicated shipping form.
create or replace function change_units_status(
  p_unit_ids uuid[],
  p_to_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_row record;
  v_count int;
begin
  if cardinality(p_unit_ids) < 1
    or cardinality(p_unit_ids) <> (
      select count(distinct item) from unnest(p_unit_ids) item
    )
    or p_to_status not in (
      'pending','arrived','shipping','in_stock_dewu','sold','settled',
      'returned','refunded'
    ) then
    raise exception 'INVALID_STATUS';
  end if;
  if p_to_status = 'shipping' then
    raise exception 'SHIPPING_REQUIRES_SHIP_UNITS_RPC';
  end if;
  if p_to_status = 'refunded' then
    raise exception 'REFUND_REQUIRES_REFUND_UNIT_RPC';
  end if;
  if p_to_status = 'settled' then
    raise exception 'SETTLEMENT_REQUIRES_SETTLE_UNITS_RPC';
  end if;

  perform 1
  from inventory_units
  where user_id = v_uid and id = any(p_unit_ids)
  for update;
  select count(*) into v_count
  from inventory_units
  where user_id = v_uid and id = any(p_unit_ids);
  if v_count <> cardinality(p_unit_ids) then
    raise exception 'UNITS_NOT_FOUND';
  end if;

  for v_row in
    select id,status
    from inventory_units
    where user_id = v_uid and id = any(p_unit_ids)
  loop
    if v_row.status = p_to_status then
      continue;
    end if;
    if p_to_status = 'sold' then
      insert into sales(user_id,unit_id,sold_at)
      values(v_uid,v_row.id,current_date)
      on conflict(unit_id) do update set
        actual_payout_cents = null,
        settled_at = null,
        sold_at = coalesce(sales.sold_at, excluded.sold_at);
    else
      delete from sales where user_id = v_uid and unit_id = v_row.id;
    end if;
    update inventory_units
    set status = p_to_status
    where id = v_row.id and user_id = v_uid;
    insert into status_history(user_id,unit_id,from_status,to_status,note)
    values(
      v_uid,v_row.id,v_row.status,p_to_status,nullif(btrim(p_note),'')
    );
  end loop;
end $$;

-- Keep the existing shipping RPC atomic while distinguishing single-item
-- shipping from batch allocation in status history.
create or replace function ship_units(
  p_unit_ids uuid[],
  p_total_shipping_cents bigint,
  p_overwrite_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_count int;
  v_q bigint;
  v_r bigint;
  v_i int := 0;
  v_row record;
  v_alloc jsonb := '[]'::jsonb;
  v_over jsonb := '[]'::jsonb;
begin
  if cardinality(p_unit_ids) < 1
    or p_total_shipping_cents < 0
    or cardinality(p_unit_ids) <> (
      select count(distinct item) from unnest(p_unit_ids) item
    ) then
    raise exception 'INVALID_SHIPMENT';
  end if;

  perform 1
  from inventory_units
  where user_id = v_uid and id = any(p_unit_ids) and status <> 'refunded'
  for update;

  select count(*) into v_count
  from inventory_units
  where user_id = v_uid and id = any(p_unit_ids) and status <> 'refunded';
  if v_count <> cardinality(p_unit_ids) then
    raise exception 'UNITS_NOT_FOUND_OR_REFUNDED';
  end if;
  if exists(
    select 1 from inventory_units
    where user_id = v_uid
      and id = any(p_unit_ids)
      and outbound_shipping_cents > 0
  ) and not p_overwrite_confirmed then
    raise exception 'OVERWRITE_CONFIRMATION_REQUIRED';
  end if;

  v_q := p_total_shipping_cents / v_count;
  v_r := p_total_shipping_cents % v_count;
  for v_row in
    select id,status,outbound_shipping_cents
    from inventory_units
    where user_id = v_uid and id = any(p_unit_ids)
    order by created_at,id
  loop
    if v_row.outbound_shipping_cents > 0 then
      v_over := v_over || to_jsonb(v_row.id::text);
    end if;
    delete from sales where user_id = v_uid and unit_id = v_row.id;
    update inventory_units
    set outbound_shipping_cents = v_q + case when v_i < v_r then 1 else 0 end,
        status = 'shipping'
    where id = v_row.id and user_id = v_uid;
    insert into status_history(user_id,unit_id,from_status,to_status,note)
    values(
      v_uid,v_row.id,v_row.status,'shipping',
      case
        when v_row.outbound_shipping_cents > 0 then '覆盖寄出运费'
        when v_count = 1 then '单件寄出'
        else '批量寄出'
      end
    );
    v_alloc := v_alloc || jsonb_build_object(
      'unitId',v_row.id,
      'shippingCents',v_q + case when v_i < v_r then 1 else 0 end
    );
    v_i := v_i + 1;
  end loop;

  return jsonb_build_object(
    'allocations',v_alloc,
    'totalShippingCents',p_total_shipping_cents,
    'overwrittenUnitIds',v_over
  );
end $$;

create or replace function clear_all_data(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_paths text[];
  c_products int;
  c_batches int;
  c_units int;
  c_sales int;
  c_rebates int;
  c_history int;
  c_attachments int;
begin
  if p_confirmation <> '清空' then
    raise exception 'CONFIRMATION_REQUIRED';
  end if;
  select count(*) into c_products from products where user_id = v_uid;
  select count(*) into c_batches from purchase_batches where user_id = v_uid;
  select count(*) into c_units from inventory_units where user_id = v_uid;
  select count(*) into c_sales from sales where user_id = v_uid;
  select count(*) into c_rebates from monthly_rebates where user_id = v_uid;
  select count(*) into c_history from status_history where user_id = v_uid;
  select count(*),coalesce(array_agg(path),'{}')
    into c_attachments,v_paths
    from attachments where user_id = v_uid;

  insert into storage_deletion_jobs(user_id,path)
  select v_uid,unnest(v_paths)
  on conflict(user_id,path) do nothing;
  delete from attachments where user_id = v_uid;
  delete from monthly_rebates where user_id = v_uid;
  delete from products where user_id = v_uid;

  return jsonb_build_object(
    'products',c_products,
    'batches',c_batches,
    'units',c_units,
    'sales',c_sales,
    'rebates',c_rebates,
    'history',c_history,
    'attachments',c_attachments,
    'pendingStoragePaths',to_jsonb(v_paths)
  );
end $$;

revoke all on function save_monthly_rebates(date,bigint,bigint)
  from public, anon;
revoke all on function create_purchase_simple(jsonb)
  from public, anon;
revoke all on function ship_units(uuid[],bigint,boolean)
  from public, anon;
revoke all on function clear_all_data(text)
  from public, anon;
revoke all on function change_units_status(uuid[],text,text)
  from public, anon;

grant execute on function save_monthly_rebates(date,bigint,bigint)
  to authenticated;
grant execute on function create_purchase_simple(jsonb)
  to authenticated;
grant execute on function ship_units(uuid[],bigint,boolean)
  to authenticated;
grant execute on function clear_all_data(text)
  to authenticated;
grant execute on function change_units_status(uuid[],text,text)
  to authenticated;

commit;
