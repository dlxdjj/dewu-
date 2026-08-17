-- Rebate income belongs only to the owner's standard workflow.
-- Bulk/import accounts keep sales, profit and shipping, but cannot write rebates.
begin;

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
  if not exists (
    select 1 from account_preferences
    where user_id = v_uid and workflow = 'standard'
  ) then
    raise exception 'REBATE_NOT_AVAILABLE';
  end if;

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

commit;
