-- Auditable shipping expense ledger used by monthly reports.
begin;

create table shipping_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipped_at date not null,
  total_shipping_cents bigint not null check (total_shipping_cents >= 0),
  mode text not null check (mode in ('append','replace')),
  estimated boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shipping_event_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references shipping_events(id) on delete cascade,
  unit_id uuid not null references inventory_units(id) on delete cascade,
  allocated_shipping_cents bigint not null check (allocated_shipping_cents >= 0),
  active boolean not null default true,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_shipping_events_user_date
  on shipping_events(user_id, shipped_at desc);
create index idx_shipping_items_user_unit_active
  on shipping_event_items(user_id, unit_id, active);
create index idx_shipping_items_event on shipping_event_items(event_id);

create trigger trg_shipping_events_updated
  before update on shipping_events
  for each row execute function set_updated_at();

alter table shipping_events enable row level security;
alter table shipping_event_items enable row level security;
create policy "owned read" on shipping_events
  for select to authenticated using (user_id = auth.uid());
create policy "owned read" on shipping_event_items
  for select to authenticated using (user_id = auth.uid());
revoke all on shipping_events, shipping_event_items from anon, authenticated;
grant select on shipping_events, shipping_event_items to authenticated;

-- Preserve pre-migration totals. The best available shipping date is the last
-- transition to shipping; fall back to the unit update date when history is old.
with legacy as (
  select
    u.id as unit_id,
    u.user_id,
    u.outbound_shipping_cents,
    coalesce(
      (select h.created_at::date
       from status_history h
       where h.unit_id = u.id and h.to_status = 'shipping'
       order by h.created_at desc limit 1),
      u.updated_at::date
    ) as shipped_at
  from inventory_units u
  where u.outbound_shipping_cents > 0
), prepared as materialized (
  select gen_random_uuid() as event_id, legacy.* from legacy
), inserted as (
  insert into shipping_events(
    id, user_id, shipped_at, total_shipping_cents, mode, estimated, note
  )
  select
    event_id, user_id, shipped_at, outbound_shipping_cents, 'append', true,
    '由升级前商品累计运费自动补录'
  from prepared
  returning id
)
insert into shipping_event_items(
  user_id, event_id, unit_id, allocated_shipping_cents
)
select p.user_id, p.event_id, p.unit_id, p.outbound_shipping_cents
from prepared p
join inserted e on e.id = p.event_id;

create or replace function record_shipment(
  p_unit_ids uuid[],
  p_total_shipping_cents bigint,
  p_mode text,
  p_shipped_at date
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
  v_event_id uuid;
  v_amount bigint;
  v_alloc jsonb := '[]'::jsonb;
  v_over jsonb := '[]'::jsonb;
begin
  if cardinality(p_unit_ids) < 1
    or p_total_shipping_cents is null
    or p_total_shipping_cents < 0
    or p_shipped_at is null
    or p_mode not in ('append','replace')
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

  if p_mode = 'replace' then
    update shipping_event_items
    set active = false, voided_at = now()
    where user_id = v_uid and unit_id = any(p_unit_ids) and active;
  end if;

  insert into shipping_events(
    user_id, shipped_at, total_shipping_cents, mode
  ) values (
    v_uid, p_shipped_at, p_total_shipping_cents, p_mode
  ) returning id into v_event_id;

  v_q := p_total_shipping_cents / v_count;
  v_r := p_total_shipping_cents % v_count;
  for v_row in
    select id,status,outbound_shipping_cents
    from inventory_units
    where user_id = v_uid and id = any(p_unit_ids)
    order by created_at,id
  loop
    v_amount := v_q + case when v_i < v_r then 1 else 0 end;
    if v_row.outbound_shipping_cents > 0 then
      v_over := v_over || to_jsonb(v_row.id::text);
    end if;
    delete from sales where user_id = v_uid and unit_id = v_row.id;
    update inventory_units
    set outbound_shipping_cents = case
          when p_mode = 'append' then outbound_shipping_cents + v_amount
          else v_amount
        end,
        status = 'shipping'
    where id = v_row.id and user_id = v_uid;
    insert into shipping_event_items(
      user_id,event_id,unit_id,allocated_shipping_cents
    ) values (v_uid,v_event_id,v_row.id,v_amount);
    insert into status_history(user_id,unit_id,from_status,to_status,note)
    values(
      v_uid,v_row.id,v_row.status,'shipping',
      case
        when p_mode = 'replace' and v_row.outbound_shipping_cents > 0
          then '纠正累计寄出运费'
        when v_count = 1 then '单件寄出'
        else '批量寄出'
      end
    );
    v_alloc := v_alloc || jsonb_build_object(
      'unitId',v_row.id,'shippingCents',v_amount
    );
    v_i := v_i + 1;
  end loop;

  return jsonb_build_object(
    'allocations',v_alloc,
    'totalShippingCents',p_total_shipping_cents,
    'overwrittenUnitIds',v_over
  );
end $$;

-- Clear the ledger together with all other owned business data.
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
  if p_confirmation <> '清空' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  select count(*) into c_products from products where user_id = v_uid;
  select count(*) into c_batches from purchase_batches where user_id = v_uid;
  select count(*) into c_units from inventory_units where user_id = v_uid;
  select count(*) into c_sales from sales where user_id = v_uid;
  select count(*) into c_rebates from monthly_rebates where user_id = v_uid;
  select count(*) into c_history from status_history where user_id = v_uid;
  select count(*),coalesce(array_agg(path),'{}')
    into c_attachments,v_paths from attachments where user_id = v_uid;

  insert into storage_deletion_jobs(user_id,path)
  select v_uid,unnest(v_paths) on conflict(user_id,path) do nothing;
  delete from attachments where user_id = v_uid;
  delete from monthly_rebates where user_id = v_uid;
  delete from shipping_events where user_id = v_uid;
  delete from products where user_id = v_uid;

  return jsonb_build_object(
    'products',c_products,'batches',c_batches,'units',c_units,
    'sales',c_sales,'rebates',c_rebates,'history',c_history,
    'attachments',c_attachments,'pendingStoragePaths',to_jsonb(v_paths)
  );
end $$;

revoke all on function record_shipment(uuid[],bigint,text,date)
  from public, anon;
grant execute on function record_shipment(uuid[],bigint,text,date)
  to authenticated;

commit;
