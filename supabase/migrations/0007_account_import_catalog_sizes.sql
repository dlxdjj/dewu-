-- Per-account workflows, verified shared product metadata, atomic spreadsheet imports,
-- and later size assignment. Business rows remain strictly owned by user_id.
begin;

create table account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workflow text not null default 'bulk' check (workflow in ('standard','bulk')),
  updated_at timestamptz not null default now()
);

-- Accounts that already existed before this feature keep the current application.
insert into account_preferences(user_id, workflow)
select id, 'standard' from auth.users
on conflict (user_id) do nothing;

create or replace function create_account_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into account_preferences(user_id, workflow)
  values(new.id, 'bulk')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_create_account_preferences on auth.users;
create trigger trg_create_account_preferences
after insert on auth.users
for each row execute function create_account_preferences();

alter table account_preferences enable row level security;
create policy "owned preferences read" on account_preferences
for select to authenticated using (user_id = auth.uid());
revoke all on account_preferences from anon, authenticated;
grant select on account_preferences to authenticated;

create or replace function get_my_account_preferences()
returns account_preferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_row account_preferences;
begin
  insert into account_preferences(user_id, workflow)
  values(v_uid, 'bulk')
  on conflict (user_id) do nothing;
  select * into v_row from account_preferences where user_id = v_uid;
  return v_row;
end $$;

create or replace function normalize_style_code(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(
    regexp_replace(
      translate(btrim(coalesce(p_value, '')), '‐‑‒–—−', '------'),
      '[[:space:]]+', '', 'g'
    )
  )
$$;

create table catalog_products (
  id uuid primary key default gen_random_uuid(),
  normalized_style_code text not null unique,
  display_style_code text not null,
  canonical_name text not null,
  image_path text,
  source_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalized_style_code <> '' and btrim(display_style_code) <> '' and btrim(canonical_name) <> '')
);

create trigger trg_catalog_products_updated before update on catalog_products
for each row execute function set_updated_at();

alter table catalog_products enable row level security;
create policy "authenticated catalog read" on catalog_products
for select to authenticated using (true);
revoke all on catalog_products from anon, authenticated;
grant select on catalog_products to authenticated;

alter table products
add column catalog_product_id uuid references catalog_products(id) on delete set null;
create index idx_products_catalog on products(catalog_product_id);

create or replace function sync_catalog_product(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_product products;
  v_catalog_id uuid;
  v_image_path text;
begin
  if not exists(
    select 1 from account_preferences
    where user_id = v_uid and workflow = 'standard'
  ) then
    return null;
  end if;

  select * into v_product
  from products
  where id = p_product_id and user_id = v_uid;
  if v_product.id is null or normalize_style_code(v_product.style_code) = '' then
    return null;
  end if;

  select path into v_image_path
  from attachments
  where user_id = v_uid
    and owner_type = 'product'
    and owner_id = p_product_id
    and kind = 'product_image'
  order by created_at desc, id desc
  limit 1;

  insert into catalog_products(
    normalized_style_code, display_style_code, canonical_name,
    image_path, source_user_id, verified_at
  ) values (
    normalize_style_code(v_product.style_code), btrim(v_product.style_code),
    btrim(v_product.name), v_image_path, v_uid, now()
  )
  on conflict (normalized_style_code) do update
  set display_style_code = excluded.display_style_code,
      canonical_name = excluded.canonical_name,
      image_path = coalesce(excluded.image_path, catalog_products.image_path),
      source_user_id = excluded.source_user_id,
      verified_at = now(),
      updated_at = now()
  returning id into v_catalog_id;

  update products
  set catalog_product_id = v_catalog_id
  where id = p_product_id and user_id = v_uid;
  return v_catalog_id;
end $$;

-- Seed the shared name/image catalog only from accounts that existed before this migration.
do $$
declare
  v_product record;
  v_catalog_id uuid;
begin
  for v_product in
    select p.*,
      (
        select a.path from attachments a
        where a.user_id = p.user_id and a.owner_type = 'product'
          and a.owner_id = p.id and a.kind = 'product_image'
        order by a.created_at desc, a.id desc limit 1
      ) as image_path
    from products p
    join account_preferences pref on pref.user_id = p.user_id
    where pref.workflow = 'standard'
      and normalize_style_code(p.style_code) <> ''
    order by p.updated_at, p.id
  loop
    insert into catalog_products(
      normalized_style_code, display_style_code, canonical_name,
      image_path, source_user_id, verified_at
    ) values (
      normalize_style_code(v_product.style_code), btrim(v_product.style_code),
      btrim(v_product.name), v_product.image_path, v_product.user_id, now()
    )
    on conflict (normalized_style_code) do update
    set display_style_code = excluded.display_style_code,
        canonical_name = excluded.canonical_name,
        image_path = coalesce(excluded.image_path, catalog_products.image_path),
        source_user_id = excluded.source_user_id,
        verified_at = now(),
        updated_at = now()
    returning id into v_catalog_id;

    update products set catalog_product_id = v_catalog_id
    where id = v_product.id;
  end loop;
end $$;

-- A private catalog image may be read by another signed-in account only after the
-- path was explicitly published into catalog_products. Deletes remain owner-only.
create policy "catalog storage read" on storage.objects
for select to authenticated using (
  bucket_id = 'attachments'
  and exists(select 1 from catalog_products where image_path = name)
);

create table spreadsheet_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_hash text not null,
  row_count integer not null default 0,
  unit_count integer not null default 0,
  total_cost_cents bigint not null default 0,
  matched_rows integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, file_hash)
);
alter table spreadsheet_imports enable row level security;
create policy "owned spreadsheet imports read" on spreadsheet_imports
for select to authenticated using (user_id = auth.uid());
revoke all on spreadsheet_imports from anon, authenticated;
grant select on spreadsheet_imports to authenticated;

create or replace function import_purchases_from_spreadsheet(
  p_rows jsonb,
  p_file_hash text,
  p_purchased_at date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_import spreadsheet_imports;
  v_item jsonb;
  v_product products;
  v_catalog catalog_products;
  v_batch purchase_batches;
  v_unit inventory_units;
  v_style text;
  v_name text;
  v_size text;
  v_qty integer;
  v_price bigint;
  v_rows integer := 0;
  v_units integer := 0;
  v_total bigint := 0;
  v_matched integer := 0;
begin
  if not exists(
    select 1 from account_preferences
    where user_id = v_uid and workflow = 'bulk'
  ) then
    raise exception 'SPREADSHEET_IMPORT_NOT_ENABLED';
  end if;
  if jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) < 1
    or jsonb_array_length(p_rows) > 1000
    or p_file_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_SPREADSHEET_IMPORT';
  end if;

  insert into spreadsheet_imports(user_id, file_hash)
  values(v_uid, p_file_hash)
  returning * into v_import;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_style := nullif(btrim(v_item->>'styleCode'), '');
    v_name := nullif(btrim(v_item->>'productName'), '');
    v_size := coalesce(nullif(btrim(v_item->>'size'), ''), '');
    v_qty := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unitPriceCents')::bigint;

    if v_style is null or v_name is null or normalize_style_code(v_style) = ''
      or v_qty < 1 or v_qty > 999 or v_price < 0 then
      raise exception 'INVALID_SPREADSHEET_ROW';
    end if;
    if v_units + v_qty > 5000 then
      raise exception 'SPREADSHEET_UNIT_LIMIT';
    end if;

    v_catalog := null;
    select * into v_catalog from catalog_products
    where normalized_style_code = normalize_style_code(v_style)
    limit 1;

    v_product := null;
    select * into v_product from products
    where user_id = v_uid
      and normalize_style_code(style_code) = normalize_style_code(v_style)
    order by created_at, id
    limit 1;

    if v_product.id is null then
      insert into products(user_id, name, style_code, catalog_product_id)
      values(
        v_uid,
        coalesce(v_catalog.canonical_name, v_name),
        coalesce(v_catalog.display_style_code, v_style),
        v_catalog.id
      ) returning * into v_product;
    elsif v_catalog.id is not null then
      update products
      set name = v_catalog.canonical_name,
          style_code = v_catalog.display_style_code,
          catalog_product_id = v_catalog.id
      where id = v_product.id and user_id = v_uid
      returning * into v_product;
    end if;

    insert into purchase_batches(
      user_id, product_id, platform, order_no, unit_price_cents, quantity,
      shipping_fee_cents, discount_amount_cents, purchased_at, note
    ) values (
      v_uid, v_product.id, 'other', null, v_price, v_qty,
      0, 0, p_purchased_at, '表格导入'
    ) returning * into v_batch;

    for i in 1..v_qty loop
      insert into inventory_units(
        user_id, batch_id, product_id, size, unit_cost_cents,
        outbound_shipping_cents, status
      ) values (
        v_uid, v_batch.id, v_product.id, v_size, v_price, 0, 'arrived'
      ) returning * into v_unit;
      insert into status_history(user_id, unit_id, from_status, to_status, note)
      values(v_uid, v_unit.id, null, 'arrived', '表格导入');
    end loop;

    v_rows := v_rows + 1;
    v_units := v_units + v_qty;
    v_total := v_total + v_price * v_qty;
    if v_catalog.id is not null then v_matched := v_matched + 1; end if;
  end loop;

  update spreadsheet_imports
  set row_count = v_rows,
      unit_count = v_units,
      total_cost_cents = v_total,
      matched_rows = v_matched
  where id = v_import.id and user_id = v_uid;

  return jsonb_build_object(
    'importId', v_import.id,
    'rowCount', v_rows,
    'unitCount', v_units,
    'totalCostCents', v_total,
    'matchedRows', v_matched,
    'unmatchedRows', v_rows - v_matched
  );
exception
  when unique_violation then
    raise exception 'SPREADSHEET_ALREADY_IMPORTED';
end $$;

create or replace function assign_unit_sizes(p_assignments jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_item jsonb;
  v_id uuid;
  v_size text;
  v_count integer := 0;
begin
  if jsonb_typeof(p_assignments) <> 'array'
    or jsonb_array_length(p_assignments) < 1
    or jsonb_array_length(p_assignments) > 999 then
    raise exception 'INVALID_SIZE_ASSIGNMENTS';
  end if;
  if jsonb_array_length(p_assignments) <> (
    select count(distinct value->>'unitId') from jsonb_array_elements(p_assignments)
  ) then
    raise exception 'DUPLICATE_SIZE_ASSIGNMENTS';
  end if;

  for v_item in select value from jsonb_array_elements(p_assignments)
  loop
    v_id := (v_item->>'unitId')::uuid;
    v_size := nullif(btrim(v_item->>'size'), '');
    if v_size is null or length(v_size) > 40 then
      raise exception 'INVALID_SIZE';
    end if;
    update inventory_units
    set size = v_size
    where id = v_id and user_id = v_uid;
    if not found then raise exception 'UNIT_NOT_FOUND'; end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Recreate purchase creation so each workflow gets the intended name/platform/size behavior.
create or replace function create_purchase_simple(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_workflow text;
  v_product products;
  v_catalog catalog_products;
  v_batch purchase_batches;
  v_unit inventory_units;
  v_ids jsonb := '[]'::jsonb;
  v_qty integer;
  v_price bigint;
  v_status text;
  v_style_code text;
  v_product_name text;
  v_size text;
  v_platform text;
begin
  select (get_my_account_preferences()).workflow into v_workflow;
  v_qty := (p_input->>'quantity')::integer;
  v_price := (p_input->>'unitPriceCents')::bigint;
  v_status := p_input->>'initialStatus';
  v_style_code := nullif(btrim(p_input->>'styleCode'), '');
  v_product_name := nullif(btrim(p_input->>'productName'), '');
  v_size := coalesce(nullif(btrim(p_input->>'size'), ''), '');
  v_platform := case when v_workflow = 'bulk' then 'other' else p_input->>'platform' end;

  if v_style_code is null or v_product_name is null then raise exception 'INVALID_PURCHASE'; end if;
  if v_workflow = 'standard' and v_size = '' then raise exception 'INVALID_PURCHASE'; end if;
  if v_qty < 1 or v_qty > 999 or v_price < 0 then raise exception 'INVALID_PURCHASE'; end if;
  if v_platform not in ('taobao','jd','pdd','vipshop','other') then raise exception 'INVALID_PURCHASE'; end if;
  if v_status not in ('pending','arrived','in_stock_dewu','returned') then raise exception 'INVALID_INITIAL_STATUS'; end if;

  if v_workflow = 'bulk' then
    select * into v_catalog from catalog_products
    where normalized_style_code = normalize_style_code(v_style_code) limit 1;
  end if;

  select * into v_product from products
  where user_id = v_uid
    and normalize_style_code(style_code) = normalize_style_code(v_style_code)
  order by created_at, id limit 1;

  if v_product.id is null then
    insert into products(user_id, name, style_code, catalog_product_id)
    values(
      v_uid,
      coalesce(v_catalog.canonical_name, v_product_name),
      coalesce(v_catalog.display_style_code, v_style_code),
      v_catalog.id
    ) returning * into v_product;
  elsif v_workflow = 'bulk' and v_catalog.id is not null then
    update products
    set name = v_catalog.canonical_name,
        style_code = v_catalog.display_style_code,
        catalog_product_id = v_catalog.id
    where id = v_product.id and user_id = v_uid
    returning * into v_product;
  end if;

  insert into purchase_batches(
    user_id, product_id, platform, order_no, unit_price_cents, quantity,
    shipping_fee_cents, discount_amount_cents, purchased_at, note
  ) values (
    v_uid, v_product.id, v_platform, nullif(btrim(p_input->>'orderNo'), ''),
    v_price, v_qty, 0, 0, (p_input->>'purchasedAt')::date,
    nullif(btrim(p_input->>'note'), '')
  ) returning * into v_batch;

  for i in 1..v_qty loop
    insert into inventory_units(
      user_id, batch_id, product_id, size, unit_cost_cents,
      outbound_shipping_cents, status
    ) values (
      v_uid, v_batch.id, v_product.id, v_size, v_price, 0, v_status
    ) returning * into v_unit;
    insert into status_history(user_id, unit_id, from_status, to_status, note)
    values(v_uid, v_unit.id, null, v_status, '采购入库');
    v_ids := v_ids || to_jsonb(v_unit.id::text);
  end loop;

  if v_workflow = 'standard' then
    perform sync_catalog_product(v_product.id);
  end if;

  return jsonb_build_object(
    'productId', v_product.id,
    'batchId', v_batch.id,
    'unitIds', v_ids
  );
end $$;

create or replace function create_attachment(
  p_owner_type text,
  p_owner_id uuid,
  p_kind text,
  p_path text,
  p_content_type text
)
returns attachments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_row attachments;
begin
  if split_part(p_path, '/', 1) <> v_uid::text then
    raise exception 'INVALID_STORAGE_PATH';
  end if;
  insert into attachments(user_id, owner_type, owner_id, kind, path, content_type)
  values(v_uid, p_owner_type, p_owner_id, p_kind, p_path, p_content_type)
  returning * into v_row;
  if p_owner_type = 'product' and p_kind = 'product_image' then
    perform sync_catalog_product(p_owner_id);
  end if;
  return v_row;
end $$;

revoke all on function create_account_preferences() from public, anon;
revoke all on function get_my_account_preferences() from public, anon;
revoke all on function normalize_style_code(text) from public, anon;
revoke all on function sync_catalog_product(uuid) from public, anon, authenticated;
revoke all on function import_purchases_from_spreadsheet(jsonb,text,date) from public, anon;
revoke all on function assign_unit_sizes(jsonb) from public, anon;
revoke all on function create_purchase_simple(jsonb) from public, anon;
revoke all on function create_attachment(text,uuid,text,text,text) from public, anon;

grant execute on function get_my_account_preferences() to authenticated;
grant execute on function normalize_style_code(text) to authenticated;
grant execute on function import_purchases_from_spreadsheet(jsonb,text,date) to authenticated;
grant execute on function assign_unit_sizes(jsonb) to authenticated;
grant execute on function create_purchase_simple(jsonb) to authenticated;
grant execute on function create_attachment(text,uuid,text,text,text) to authenticated;

commit;
