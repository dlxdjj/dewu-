-- Server-side dashboards and paged inventory/report reads.
-- Existing write paths and RLS remain unchanged.
begin;

create or replace function get_home_dashboard(p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_start date;
  v_end date;
  v_rebates_enabled boolean := false;
  v_inventory_count bigint;
  v_inventory_cost bigint;
  v_sales_count bigint;
  v_sales_cents bigint;
  v_sales_profit bigint;
  v_rebate_cents bigint;
  v_shipping_cents bigint;
  v_pending bigint;
  v_arrived bigint;
  v_shipping bigint;
  v_in_stock bigint;
  v_sold bigint;
  v_returned bigint;
begin
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'INVALID_MONTH';
  end if;
  v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  if to_char(v_start, 'YYYY-MM') <> p_month then raise exception 'INVALID_MONTH'; end if;
  v_end := (v_start + interval '1 month')::date;

  select coalesce(workflow = 'standard', false)
  into v_rebates_enabled
  from account_preferences
  where user_id = v_uid;

  select
    count(*) filter (where status in ('pending','arrived','shipping','in_stock_dewu','returned')),
    coalesce(sum(unit_cost_cents) filter (where status in ('pending','arrived','shipping','in_stock_dewu','returned')), 0),
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'arrived'),
    count(*) filter (where status = 'shipping'),
    count(*) filter (where status = 'in_stock_dewu'),
    count(*) filter (where status = 'sold'),
    count(*) filter (where status = 'returned')
  into
    v_inventory_count, v_inventory_cost, v_pending, v_arrived,
    v_shipping, v_in_stock, v_sold, v_returned
  from inventory_units
  where user_id = v_uid and status <> 'refunded';

  select
    count(*),
    coalesce(sum(s.actual_payout_cents), 0),
    coalesce(sum(s.actual_payout_cents - u.unit_cost_cents - u.outbound_shipping_cents), 0)
  into v_sales_count, v_sales_cents, v_sales_profit
  from sales s
  join inventory_units u on u.id = s.unit_id and u.user_id = v_uid
  where s.user_id = v_uid
    and u.status <> 'refunded'
    and s.actual_payout_cents is not null
    and s.settled_at >= v_start
    and s.settled_at < v_end;

  if v_rebates_enabled then
    select coalesce(sum(amount_cents), 0)
    into v_rebate_cents
    from monthly_rebates
    where user_id = v_uid and month >= v_start and month < v_end;
  else
    v_rebate_cents := 0;
  end if;

  select coalesce(sum(i.allocated_shipping_cents), 0)
  into v_shipping_cents
  from shipping_event_items i
  join shipping_events e on e.id = i.event_id and e.user_id = v_uid
  where i.user_id = v_uid and i.active
    and e.shipped_at >= v_start and e.shipped_at < v_end;

  return jsonb_build_object(
    'inventoryCount', v_inventory_count,
    'inventoryCostCents', v_inventory_cost,
    'month', p_month,
    'monthLabel', extract(month from v_start)::int || '月',
    'monthlySalesCount', v_sales_count,
    'monthlySalesCents', v_sales_cents,
    'monthlyShippingCents', v_shipping_cents,
    'monthlyRebateCents', v_rebate_cents,
    'monthlyProfitCents', v_sales_profit + v_rebate_cents,
    'rebatesEnabled', v_rebates_enabled,
    'todoCounts', jsonb_build_object(
      'pending', v_pending,
      'arrived', v_arrived,
      'shipping', v_shipping,
      'in_stock_dewu', v_in_stock,
      'sold', v_sold,
      'returned', v_returned
    )
  );
end $$;

create or replace function list_inventory_groups_page(
  p_view text default 'active',
  p_status text default 'all',
  p_platform text default 'all',
  p_query text default '',
  p_missing_size_only boolean default false,
  p_sort text default 'purchase_desc',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if p_view not in ('active','settlement','sales','refunds') then
    raise exception 'INVALID_INVENTORY_VIEW';
  end if;
  if p_sort not in ('purchase_desc','purchase_asc','cost_desc','cost_asc','profit_desc','profit_asc') then
    raise exception 'INVALID_INVENTORY_SORT';
  end if;

  with joined as (
    select
      u, p, b, s,
      coalesce(nullif(normalize_style_code(p.style_code), ''), 'legacy-product:' || p.id::text)
        || '|' || lower(btrim(u.size)) as group_key,
      case b.platform
        when 'taobao' then '淘宝'
        when 'jd' then '京东'
        when 'pdd' then '拼多多'
        when 'vipshop' then '唯品会'
        else '其他'
      end as platform_label
    from inventory_units u
    join products p on p.id = u.product_id and p.user_id = v_uid
    join purchase_batches b on b.id = u.batch_id and b.user_id = v_uid
    left join sales s on s.unit_id = u.id and s.user_id = v_uid
    where u.user_id = v_uid
      and (
        (p_view = 'active' and u.status in ('pending','arrived','shipping','in_stock_dewu','returned'))
        or (p_view = 'settlement' and u.status = 'sold')
        or (p_view = 'sales' and u.status = 'settled')
        or (p_view = 'refunds' and u.status = 'refunded')
      )
      and (p_view <> 'active' or coalesce(p_status, 'all') = 'all' or u.status = p_status)
      and (coalesce(p_platform, 'all') = 'all' or b.platform = p_platform)
      and (not coalesce(p_missing_size_only, false) or btrim(u.size) = '')
      and (
        btrim(coalesce(p_query, '')) = ''
        or p.name ilike '%' || btrim(p_query) || '%'
        or coalesce(p.style_code, '') ilike '%' || btrim(p_query) || '%'
        or u.size ilike '%' || btrim(p_query) || '%'
        or coalesce(b.order_no, '') ilike '%' || btrim(p_query) || '%'
        or (case b.platform
          when 'taobao' then '淘宝'
          when 'jd' then '京东'
          when 'pdd' then '拼多多'
          when 'vipshop' then '唯品会'
          else '其他'
        end) ilike '%' || btrim(p_query) || '%'
      )
  ), grouped as (
    select
      group_key,
      (jsonb_agg(to_jsonb(p) order by (u).created_at, (u).id)->0) as product,
      nullif(btrim((jsonb_agg(to_jsonb(p) order by (u).created_at, (u).id)->0->>'style_code')), '') as style_code,
      (jsonb_agg((u).size order by (u).created_at, (u).id)->>0) as size,
      sum((u).unit_cost_cents)::bigint as total_cost_cents,
      array_agg(distinct (b).platform order by (b).platform) as platforms,
      jsonb_build_object(
        'pending', count(*) filter (where (u).status = 'pending'),
        'arrived', count(*) filter (where (u).status = 'arrived'),
        'shipping', count(*) filter (where (u).status = 'shipping'),
        'in_stock_dewu', count(*) filter (where (u).status = 'in_stock_dewu'),
        'sold', count(*) filter (where (u).status = 'sold'),
        'settled', count(*) filter (where (u).status = 'settled'),
        'returned', count(*) filter (where (u).status = 'returned'),
        'refunded', count(*) filter (where (u).status = 'refunded')
      ) as status_counts,
      jsonb_agg(
        to_jsonb(u) || jsonb_build_object(
          'product', to_jsonb(p),
          'batch', to_jsonb(b),
          'sale', case when (s).id is null then 'null'::jsonb else to_jsonb(s) end
        ) order by (u).created_at, (u).id
      ) as units,
      max((b).purchased_at) as purchased_at,
      sum(
        case when (s).actual_payout_cents is null then 0
        else (s).actual_payout_cents - (u).unit_cost_cents - (u).outbound_shipping_cents end
      )::bigint as profit_cents
    from joined
    group by group_key
  ), ordered as (
    select *, count(*) over() as total_groups
    from grouped
    order by
      case when p_sort = 'purchase_asc' then purchased_at end asc,
      case when p_sort = 'purchase_desc' then purchased_at end desc,
      case when p_sort = 'cost_asc' then total_cost_cents end asc,
      case when p_sort = 'cost_desc' then total_cost_cents end desc,
      case when p_sort = 'profit_asc' then profit_cents end asc,
      case when p_sort = 'profit_desc' then profit_cents end desc,
      group_key
    limit v_limit offset v_offset
  ), counts as (
    select
      count(*) filter (where status in ('pending','arrived','shipping','in_stock_dewu','returned')) as active,
      count(*) filter (where status = 'sold') as settlement,
      count(*) filter (where status = 'settled') as sales,
      count(*) filter (where status = 'refunded') as refunds
    from inventory_units where user_id = v_uid
  )
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', group_key,
        'product', product,
        'styleCode', style_code,
        'size', size,
        'totalCostCents', total_cost_cents,
        'platforms', to_jsonb(platforms),
        'statusCounts', status_counts,
        'units', units,
        'purchasedAt', purchased_at,
        'profitCents', profit_cents
      )) from ordered
    ), '[]'::jsonb),
    'totalGroups', coalesce((select max(total_groups) from ordered), 0),
    'totalUnits', (select count(*) from joined),
    'counts', (select to_jsonb(counts) from counts),
    'availablePlatforms', coalesce((
      select to_jsonb(array_agg(distinct platform order by platform))
      from purchase_batches where user_id = v_uid
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function get_report_dashboard(
  p_month text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_losses_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_start date;
  v_end date;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rebates_enabled boolean := false;
  v_result jsonb;
begin
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'INVALID_MONTH'; end if;
  v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  if to_char(v_start, 'YYYY-MM') <> p_month then raise exception 'INVALID_MONTH'; end if;
  v_end := (v_start + interval '1 month')::date;
  select coalesce(workflow = 'standard', false) into v_rebates_enabled
  from account_preferences where user_id = v_uid;

  with base as (
    select
      u, p, b, s,
      (s.actual_payout_cents - u.unit_cost_cents - u.outbound_shipping_cents)::bigint as profit
    from sales s
    join inventory_units u on u.id = s.unit_id and u.user_id = v_uid
    join products p on p.id = u.product_id and p.user_id = v_uid
    join purchase_batches b on b.id = u.batch_id and b.user_id = v_uid
    where s.user_id = v_uid and u.status <> 'refunded'
      and s.actual_payout_cents is not null and s.settled_at is not null
  ), selected as (
    select * from base
    where (s).settled_at >= v_start and (s).settled_at < v_end
  ), filtered as (
    select *, count(*) over() as total_rows
    from selected
    where not coalesce(p_losses_only, false) or profit < 0
    order by (s).settled_at desc, (s).id desc
    limit v_limit offset v_offset
  ), all_shipping as (
    select coalesce(sum(i.allocated_shipping_cents), 0)::bigint value
    from shipping_event_items i
    join shipping_events e on e.id = i.event_id and e.user_id = v_uid
    where i.user_id = v_uid and i.active
  ), month_shipping as (
    select coalesce(sum(i.allocated_shipping_cents), 0)::bigint value
    from shipping_event_items i
    join shipping_events e on e.id = i.event_id and e.user_id = v_uid
    where i.user_id = v_uid and i.active
      and e.shipped_at >= v_start and e.shipped_at < v_end
  ), all_rebates as (
    select case when v_rebates_enabled then coalesce(sum(amount_cents), 0) else 0 end::bigint value
    from monthly_rebates where user_id = v_uid
  ), month_rebates as (
    select case when v_rebates_enabled then coalesce(sum(amount_cents), 0) else 0 end::bigint value
    from monthly_rebates where user_id = v_uid and month >= v_start and month < v_end
  )
  select jsonb_build_object(
    'allTime', jsonb_build_object(
      'profitCents', (select coalesce(sum(profit),0) from base) + (select value from all_rebates),
      'rebateCents', (select value from all_rebates),
      'shippingCents', (select value from all_shipping),
      'salesCents', (select coalesce(sum((s).actual_payout_cents),0) from base),
      'salesCount', (select count(*) from base)
    ),
    'selectedMonth', jsonb_build_object(
      'profitCents', (select coalesce(sum(profit),0) from selected) + (select value from month_rebates),
      'rebateCents', (select value from month_rebates),
      'shippingCents', (select value from month_shipping),
      'salesCents', (select coalesce(sum((s).actual_payout_cents),0) from selected),
      'salesCount', (select count(*) from selected)
    ),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'unit', to_jsonb(u), 'product', to_jsonb(p), 'batch', to_jsonb(b),
      'sale', to_jsonb(s), 'profit', profit
    )) from filtered), '[]'::jsonb),
    'totalRows', coalesce((select max(total_rows) from filtered), 0),
    'rebatesEnabled', v_rebates_enabled,
    'rebates', case when v_rebates_enabled then coalesce((
      select jsonb_agg(to_jsonb(r) order by r.source)
      from monthly_rebates r
      where r.user_id = v_uid and r.month >= v_start and r.month < v_end
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result;
  return v_result;
end $$;

revoke all on function get_home_dashboard(text) from public, anon;
revoke all on function list_inventory_groups_page(text,text,text,text,boolean,text,integer,integer) from public, anon;
revoke all on function get_report_dashboard(text,integer,integer,boolean) from public, anon;
grant execute on function get_home_dashboard(text) to authenticated;
grant execute on function list_inventory_groups_page(text,text,text,text,boolean,text,integer,integer) to authenticated;
grant execute on function get_report_dashboard(text,integer,integer,boolean) to authenticated;

create table if not exists client_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('error','slow_request','image_error')),
  route text not null default '',
  message text not null default '',
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_events_user_created
on client_events(user_id, created_at desc);
alter table client_events enable row level security;
create policy "owned client event insert" on client_events
for insert to authenticated with check (user_id = auth.uid());
create policy "owned client event read" on client_events
for select to authenticated using (user_id = auth.uid());
revoke all on client_events from anon, authenticated;
grant insert, select on client_events to authenticated;

create or replace function get_client_event_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_uid();
  v_result jsonb;
begin
  select jsonb_build_object(
    'errors', count(*) filter (where kind = 'error'),
    'slowRequests', count(*) filter (where kind = 'slow_request'),
    'imageErrors', count(*) filter (where kind = 'image_error'),
    'lastEventAt', max(created_at)
  ) into v_result
  from client_events
  where user_id = v_uid and created_at >= now() - interval '7 days';
  return v_result;
end $$;
revoke all on function get_client_event_summary() from public, anon;
grant execute on function get_client_event_summary() to authenticated;

commit;
