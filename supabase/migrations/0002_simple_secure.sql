-- Empty-start secure cents migration. Apply after 0001_init.sql.
begin;
truncate table attachments, sales, status_history, inventory_units, purchase_batches, products cascade;

-- Remove the historical anonymous policies before introducing ownership.
drop policy if exists "anon all" on products;
drop policy if exists "anon all" on purchase_batches;
drop policy if exists "anon all" on inventory_units;
drop policy if exists "anon all" on sales;
drop policy if exists "anon all" on attachments;
drop policy if exists "anon all" on status_history;
drop policy if exists "anon read attachments" on storage.objects;
drop policy if exists "anon write attachments" on storage.objects;
drop policy if exists "anon update attachments" on storage.objects;
drop policy if exists "anon delete attachments" on storage.objects;

alter table products add column user_id uuid not null references auth.users(id) on delete cascade;
alter table purchase_batches add column user_id uuid not null references auth.users(id) on delete cascade;
alter table inventory_units add column user_id uuid not null references auth.users(id) on delete cascade;
alter table sales add column user_id uuid not null references auth.users(id) on delete cascade;
alter table attachments add column user_id uuid not null references auth.users(id) on delete cascade;
alter table status_history add column user_id uuid not null references auth.users(id) on delete cascade;

alter table purchase_batches rename column unit_price to unit_price_cents;
alter table purchase_batches rename column shipping_fee to shipping_fee_cents;
alter table purchase_batches rename column discount_amount to discount_amount_cents;
alter table purchase_batches alter column unit_price_cents type bigint using round(unit_price_cents * 100)::bigint;
alter table purchase_batches alter column shipping_fee_cents type bigint using round(shipping_fee_cents * 100)::bigint;
alter table purchase_batches alter column discount_amount_cents type bigint using round(discount_amount_cents * 100)::bigint;
alter table purchase_batches add constraint batches_money_nonnegative check (unit_price_cents >= 0 and shipping_fee_cents >= 0 and discount_amount_cents >= 0);

alter table inventory_units rename column unit_cost to unit_cost_cents;
alter table inventory_units rename column listing_price to listing_price_cents;
alter table inventory_units alter column unit_cost_cents type bigint using round(unit_cost_cents * 100)::bigint;
alter table inventory_units alter column listing_price_cents type bigint using round(listing_price_cents * 100)::bigint;
alter table inventory_units add column outbound_shipping_cents bigint not null default 0;
alter table inventory_units add constraint units_money_nonnegative check (unit_cost_cents >= 0 and (listing_price_cents is null or listing_price_cents >= 0) and outbound_shipping_cents >= 0);

alter table sales rename column sold_price to sold_price_cents;
alter table sales rename column platform_fee to platform_fee_cents;
alter table sales rename column platform_subsidy to platform_subsidy_cents;
alter table sales rename column express_fee to express_fee_cents;
alter table sales rename column other_fee to other_fee_cents;
alter table sales rename column actual_payout to actual_payout_cents;
alter table sales alter column sold_price_cents type bigint using round(sold_price_cents * 100)::bigint;
alter table sales alter column platform_fee_cents type bigint using round(platform_fee_cents * 100)::bigint;
alter table sales alter column platform_subsidy_cents type bigint using round(platform_subsidy_cents * 100)::bigint;
alter table sales alter column express_fee_cents type bigint using round(express_fee_cents * 100)::bigint;
alter table sales alter column other_fee_cents type bigint using round(other_fee_cents * 100)::bigint;
alter table sales alter column actual_payout_cents type bigint using round(actual_payout_cents * 100)::bigint;
alter table sales add constraint sales_money_nonnegative check ((sold_price_cents is null or sold_price_cents >= 0) and platform_fee_cents >= 0 and platform_subsidy_cents >= 0 and express_fee_cents >= 0 and other_fee_cents >= 0 and (actual_payout_cents is null or actual_payout_cents >= 0));

alter table purchase_batches drop constraint purchase_batches_product_id_fkey;
alter table purchase_batches add constraint purchase_batches_product_id_fkey foreign key (product_id) references products(id) on delete cascade;
alter table inventory_units drop constraint inventory_units_batch_id_fkey;
alter table inventory_units add constraint inventory_units_batch_id_fkey foreign key (batch_id) references purchase_batches(id) on delete cascade;
alter table inventory_units drop constraint inventory_units_product_id_fkey;
alter table inventory_units add constraint inventory_units_product_id_fkey foreign key (product_id) references products(id) on delete cascade;
alter table sales drop constraint sales_unit_id_fkey;
alter table sales add constraint sales_unit_id_fkey foreign key (unit_id) references inventory_units(id) on delete cascade;

create table storage_deletion_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  path text not null, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(user_id, path)
);
alter table storage_deletion_jobs enable row level security;

create index idx_products_user on products(user_id);
create index idx_batches_user on purchase_batches(user_id);
create index idx_units_user on inventory_units(user_id);
create index idx_sales_user on sales(user_id);
create index idx_attachments_user on attachments(user_id);
create index idx_history_user on status_history(user_id);
create index idx_cleanup_user_pending on storage_deletion_jobs(user_id, completed_at);

-- Reads are RLS-scoped. Writes are only exposed through security-definer RPCs.
create policy "owned read" on products for select to authenticated using (user_id = auth.uid());
create policy "owned read" on purchase_batches for select to authenticated using (user_id = auth.uid());
create policy "owned read" on inventory_units for select to authenticated using (user_id = auth.uid());
create policy "owned read" on sales for select to authenticated using (user_id = auth.uid());
create policy "owned read" on attachments for select to authenticated using (user_id = auth.uid());
create policy "owned read" on status_history for select to authenticated using (user_id = auth.uid());
create policy "owned read" on storage_deletion_jobs for select to authenticated using (user_id = auth.uid());
revoke all on products, purchase_batches, inventory_units, sales, attachments, status_history, storage_deletion_jobs from anon, authenticated;
grant select on products, purchase_batches, inventory_units, sales, attachments, status_history, storage_deletion_jobs to authenticated;

update storage.buckets set public = false where id = 'attachments';
create policy "owned storage read" on storage.objects for select to authenticated using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owned storage insert" on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owned storage delete" on storage.objects for delete to authenticated using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function require_uid() returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; return v_uid; end $$;

create or replace function create_purchase_simple(p_input jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := require_uid(); v_product products; v_batch purchase_batches; v_unit inventory_units; v_ids jsonb := '[]'::jsonb; v_qty int; v_price bigint; v_status text;
begin
  v_qty := (p_input->>'quantity')::int; v_price := (p_input->>'unitPriceCents')::bigint; v_status := p_input->>'initialStatus';
  if v_qty < 1 or v_qty > 999 or v_price < 0 or v_status not in ('pending','arrived','shipping','in_stock_dewu','sold','settled','returned','refunded') then raise exception 'INVALID_PURCHASE'; end if;
  if coalesce(p_input->>'styleCode','') <> '' then select * into v_product from products where user_id=v_uid and lower(style_code)=lower(p_input->>'styleCode') limit 1; end if;
  if v_product.id is null then insert into products(user_id,name,style_code) values(v_uid,trim(p_input->>'productName'),nullif(trim(p_input->>'styleCode'),'')) returning * into v_product; end if;
  insert into purchase_batches(user_id,product_id,platform,order_no,unit_price_cents,quantity,shipping_fee_cents,discount_amount_cents,purchased_at,note)
  values(v_uid,v_product.id,p_input->>'platform',nullif(trim(p_input->>'orderNo'),''),v_price,v_qty,0,0,(p_input->>'purchasedAt')::date,nullif(trim(p_input->>'note'),'')) returning * into v_batch;
  for i in 1..v_qty loop
    insert into inventory_units(user_id,batch_id,product_id,size,unit_cost_cents,outbound_shipping_cents,status) values(v_uid,v_batch.id,v_product.id,trim(p_input->>'size'),v_price,0,v_status) returning * into v_unit;
    insert into status_history(user_id,unit_id,from_status,to_status,note) values(v_uid,v_unit.id,null,v_status,'采购入库'); v_ids := v_ids || to_jsonb(v_unit.id::text);
  end loop;
  return jsonb_build_object('productId',v_product.id,'batchId',v_batch.id,'unitIds',v_ids);
end $$;

create or replace function ship_units(p_unit_ids uuid[], p_total_shipping_cents bigint, p_overwrite_confirmed boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := require_uid(); v_count int; v_q bigint; v_r bigint; v_i int := 0; v_row record; v_alloc jsonb := '[]'::jsonb; v_over jsonb := '[]'::jsonb;
begin
  if cardinality(p_unit_ids)<1 or p_total_shipping_cents<0 or cardinality(p_unit_ids)<>(select count(distinct x) from unnest(p_unit_ids) x) then raise exception 'INVALID_SHIPMENT'; end if;
  perform 1 from inventory_units where user_id=v_uid and id=any(p_unit_ids) and status<>'refunded' for update;
  select count(*) into v_count from inventory_units where user_id=v_uid and id=any(p_unit_ids) and status<>'refunded';
  if v_count<>cardinality(p_unit_ids) then raise exception 'UNITS_NOT_FOUND_OR_REFUNDED'; end if;
  if exists(select 1 from inventory_units where user_id=v_uid and id=any(p_unit_ids) and outbound_shipping_cents>0) and not p_overwrite_confirmed then raise exception 'OVERWRITE_CONFIRMATION_REQUIRED'; end if;
  v_q:=p_total_shipping_cents/v_count; v_r:=p_total_shipping_cents%v_count;
  for v_row in select id,status,outbound_shipping_cents from inventory_units where user_id=v_uid and id=any(p_unit_ids) order by created_at,id loop
    if v_row.outbound_shipping_cents>0 then v_over:=v_over||to_jsonb(v_row.id::text); end if;
    update inventory_units set outbound_shipping_cents=v_q+case when v_i<v_r then 1 else 0 end,status='shipping' where id=v_row.id;
    insert into status_history(user_id,unit_id,from_status,to_status,note) values(v_uid,v_row.id,v_row.status,'shipping',case when v_row.outbound_shipping_cents>0 then '覆盖寄出运费' else '批量寄出' end);
    v_alloc:=v_alloc||jsonb_build_object('unitId',v_row.id,'shippingCents',v_q+case when v_i<v_r then 1 else 0 end); v_i:=v_i+1;
  end loop;
  return jsonb_build_object('allocations',v_alloc,'totalShippingCents',p_total_shipping_cents,'overwrittenUnitIds',v_over);
end $$;

create or replace function settle_units(p_unit_ids uuid[],p_actual_payout_cents bigint,p_settled_at date) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=require_uid(); v_row record; v_count int; begin if cardinality(p_unit_ids)<1 or cardinality(p_unit_ids)<>(select count(distinct x) from unnest(p_unit_ids) x) or p_actual_payout_cents<0 then raise exception 'INVALID_SETTLEMENT'; end if;
perform 1 from inventory_units where user_id=v_uid and id=any(p_unit_ids) and status<>'refunded' for update;
select count(*) into v_count from inventory_units where user_id=v_uid and id=any(p_unit_ids) and status<>'refunded'; if v_count<>cardinality(p_unit_ids) then raise exception 'UNITS_NOT_FOUND_OR_REFUNDED'; end if;
for v_row in select id,status from inventory_units where user_id=v_uid and id=any(p_unit_ids) loop
insert into sales(user_id,unit_id,sold_price_cents,platform_fee_cents,platform_subsidy_cents,express_fee_cents,other_fee_cents,actual_payout_cents,sold_at,settled_at) values(v_uid,v_row.id,0,0,0,0,0,p_actual_payout_cents,p_settled_at,p_settled_at)
on conflict(unit_id) do update set sold_price_cents=0,platform_fee_cents=0,platform_subsidy_cents=0,express_fee_cents=0,other_fee_cents=0,actual_payout_cents=excluded.actual_payout_cents,sold_at=excluded.sold_at,settled_at=excluded.settled_at;
update inventory_units set status='settled' where id=v_row.id; insert into status_history(user_id,unit_id,from_status,to_status,note) values(v_uid,v_row.id,v_row.status,'settled','登记到手价'); end loop; end $$;

create or replace function change_units_status(p_unit_ids uuid[],p_to_status text,p_note text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=require_uid(); v_row record; v_count int; begin
if cardinality(p_unit_ids)<1 or cardinality(p_unit_ids)<>(select count(distinct x) from unnest(p_unit_ids) x) or p_to_status not in ('pending','arrived','shipping','in_stock_dewu','sold','settled','returned','refunded') then raise exception 'INVALID_STATUS'; end if;
if p_to_status = 'refunded' then raise exception 'REFUND_REQUIRES_REFUND_UNIT_RPC'; end if;
if p_to_status = 'settled' then raise exception 'SETTLEMENT_REQUIRES_SETTLE_UNITS_RPC'; end if;
perform 1 from inventory_units where user_id=v_uid and id=any(p_unit_ids) for update; select count(*) into v_count from inventory_units where user_id=v_uid and id=any(p_unit_ids); if v_count<>cardinality(p_unit_ids) then raise exception 'UNITS_NOT_FOUND'; end if;
for v_row in select id,status from inventory_units where user_id=v_uid and id=any(p_unit_ids) loop if p_to_status not in ('sold','settled') then delete from sales where user_id=v_uid and unit_id=v_row.id; end if; update inventory_units set status=p_to_status where id=v_row.id; insert into status_history(user_id,unit_id,from_status,to_status,note) values(v_uid,v_row.id,v_row.status,p_to_status,nullif(trim(p_note),'')); end loop; end $$;

create or replace function refund_unit(p_unit_id uuid,p_note text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=require_uid(); v_status text; begin select status into v_status from inventory_units where id=p_unit_id and user_id=v_uid for update; if v_status is null then raise exception 'UNIT_NOT_FOUND'; end if; delete from sales where unit_id=p_unit_id and user_id=v_uid; update inventory_units set status='refunded' where id=p_unit_id; insert into status_history(user_id,unit_id,from_status,to_status,note) values(v_uid,p_unit_id,v_status,'refunded',coalesce(nullif(trim(p_note),''),'采购平台退货退款')); end $$;

create or replace function enqueue_owner_paths(v_uid uuid,v_type text,v_id uuid) returns text[] language plpgsql security definer set search_path=public,pg_temp as $$
declare paths text[]; begin select coalesce(array_agg(path),'{}') into paths from attachments where user_id=v_uid and owner_type=v_type and owner_id=v_id; insert into storage_deletion_jobs(user_id,path) select v_uid,unnest(paths) on conflict(user_id,path) do nothing; delete from attachments where user_id=v_uid and owner_type=v_type and owner_id=v_id; return paths; end $$;

create or replace function delete_unit_deep(p_unit_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=require_uid(); v_unit inventory_units; v_sale uuid; v_paths text[]:='{}'; v_batch_deleted bool:=false; v_product_deleted bool:=false; begin select * into v_unit from inventory_units where id=p_unit_id and user_id=v_uid for update; if v_unit.id is null then raise exception 'UNIT_NOT_FOUND'; end if; select id into v_sale from sales where unit_id=p_unit_id and user_id=v_uid; v_paths:=v_paths||enqueue_owner_paths(v_uid,'unit',p_unit_id); if v_sale is not null then v_paths:=v_paths||enqueue_owner_paths(v_uid,'sale',v_sale); end if; delete from inventory_units where id=p_unit_id and user_id=v_uid;
if not exists(select 1 from inventory_units where batch_id=v_unit.batch_id and user_id=v_uid) then v_paths:=v_paths||enqueue_owner_paths(v_uid,'batch',v_unit.batch_id); delete from purchase_batches where id=v_unit.batch_id and user_id=v_uid; v_batch_deleted:=true; end if;
if not exists(select 1 from inventory_units where product_id=v_unit.product_id and user_id=v_uid) and not exists(select 1 from purchase_batches where product_id=v_unit.product_id and user_id=v_uid) then v_paths:=v_paths||enqueue_owner_paths(v_uid,'product',v_unit.product_id); delete from products where id=v_unit.product_id and user_id=v_uid; v_product_deleted:=true; end if;
return jsonb_build_object('deletedUnitId',p_unit_id,'deletedBatch',v_batch_deleted,'deletedProduct',v_product_deleted,'pendingStoragePaths',to_jsonb(v_paths)); end $$;

create or replace function clear_all_data(p_confirmation text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=require_uid(); v_paths text[]; c_products int; c_batches int; c_units int; c_sales int; c_history int; c_attachments int; begin if p_confirmation<>'清空' then raise exception 'CONFIRMATION_REQUIRED'; end if;
select count(*) into c_products from products where user_id=v_uid; select count(*) into c_batches from purchase_batches where user_id=v_uid; select count(*) into c_units from inventory_units where user_id=v_uid; select count(*) into c_sales from sales where user_id=v_uid; select count(*) into c_history from status_history where user_id=v_uid; select count(*),coalesce(array_agg(path),'{}') into c_attachments,v_paths from attachments where user_id=v_uid;
insert into storage_deletion_jobs(user_id,path) select v_uid,unnest(v_paths) on conflict(user_id,path) do nothing; delete from products where user_id=v_uid;
return jsonb_build_object('products',c_products,'batches',c_batches,'units',c_units,'sales',c_sales,'history',c_history,'attachments',c_attachments,'pendingStoragePaths',to_jsonb(v_paths)); end $$;

create or replace function ack_storage_deletions(p_paths text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare v_uid uuid:=require_uid(); begin update storage_deletion_jobs set completed_at=now() where user_id=v_uid and path=any(p_paths); end $$;
create or replace function create_attachment(p_owner_type text,p_owner_id uuid,p_kind text,p_path text,p_content_type text) returns attachments language plpgsql security definer set search_path=public,pg_temp as $$ declare v_uid uuid:=require_uid(); v_row attachments; begin if split_part(p_path,'/',1)<>v_uid::text then raise exception 'INVALID_STORAGE_PATH'; end if; insert into attachments(user_id,owner_type,owner_id,kind,path,content_type) values(v_uid,p_owner_type,p_owner_id,p_kind,p_path,p_content_type) returning * into v_row; return v_row; end $$;

revoke all on function require_uid(), enqueue_owner_paths(uuid,text,uuid), create_purchase_simple(jsonb), ship_units(uuid[],bigint,boolean), settle_units(uuid[],bigint,date), change_units_status(uuid[],text,text), refund_unit(uuid,text), delete_unit_deep(uuid), clear_all_data(text), ack_storage_deletions(text[]), create_attachment(text,uuid,text,text,text) from public, anon;
grant execute on function create_purchase_simple(jsonb), ship_units(uuid[],bigint,boolean), settle_units(uuid[],bigint,date), change_units_status(uuid[],text,text), refund_unit(uuid,text), delete_unit_deep(uuid), clear_all_data(text), ack_storage_deletions(text[]), create_attachment(text,uuid,text,text,text) to authenticated;
commit;
