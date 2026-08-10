-- Require nonblank style codes for new purchases without rewriting legacy rows.
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

  if v_style_code is null then
    raise exception 'STYLE_CODE_REQUIRED';
  end if;
  if v_qty < 1 or v_qty > 999 or v_price < 0 or v_status not in ('pending','arrived','shipping','in_stock_dewu','sold','settled','returned','refunded') then
    raise exception 'INVALID_PURCHASE';
  end if;

  select * into v_product
  from products
  where user_id = v_uid and lower(style_code) = lower(v_style_code)
  order by created_at, id
  limit 1;

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
