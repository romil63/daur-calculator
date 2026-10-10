-- Run after sales_approval.sql to enable calculator staff sale requests
-- and salesperson/admin descriptions.

alter table public.sales
  add column if not exists description text not null default '',
  add column if not exists admin_description text not null default '',
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;

create or replace function public.is_daur_sales_staff()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'daur_role') in ('admin', 'salesman'), false);
$$;
revoke all on function public.is_daur_sales_staff() from public;

drop function if exists public.submit_sale(text);
create function public.submit_sale(p_model_number text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_number text := nullif(trim(p_model_number), '');
  v_description text := trim(coalesce(p_description, ''));
  v_sale_id uuid;
begin
  if not public.is_daur_sales_staff() then
    raise exception 'Daur admin or salesperson role required';
  end if;
  if v_model_number is null then
    raise exception 'A model ID is required';
  end if;
  if length(v_description) > 500 then
    raise exception 'Sale description must be 500 characters or fewer';
  end if;
  if v_description = '' then
    raise exception 'A sale description is required';
  end if;
  if not exists (select 1 from public.products where model_number = v_model_number) then
    raise exception 'Product model not found';
  end if;

  insert into public.sales (model_number, description, submitted_by)
  values (v_model_number, v_description, auth.uid())
  returning id into v_sale_id;
  return v_sale_id;
exception when unique_violation then
  raise exception 'A sale request is already pending or this model has already been sold';
end;
$$;

drop function if exists public.approve_sale(uuid);
create function public.approve_sale(p_sale_id uuid, p_admin_description text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_admin_description text := trim(coalesce(p_admin_description, ''));
begin
  if not public.is_daur_admin() then
    raise exception 'Daur admin role required';
  end if;
  if length(v_admin_description) > 500 then
    raise exception 'Admin description must be 500 characters or fewer';
  end if;
  if v_admin_description = '' then
    raise exception 'An admin description is required before approval';
  end if;

  select status into v_status
  from public.sales
  where id = p_sale_id
  for update;
  if not found then
    raise exception 'Sale request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending sale requests can be approved';
  end if;

  update public.sales
  set status = 'approved', admin_description = v_admin_description,
      reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_sale_id;
end;
$$;

revoke all on function public.submit_sale(text, text) from public, anon, authenticated;
revoke all on function public.approve_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_sale(text, text) to authenticated;
grant execute on function public.approve_sale(uuid, text) to authenticated;
