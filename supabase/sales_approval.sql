-- Run once after schema.sql and batch_tracking.sql to add sale approvals.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  model_number text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

-- A one-piece model can have one pending request or one approved sale.
create unique index if not exists sales_one_pending_or_approved_per_model
  on public.sales (model_number)
  where status in ('pending', 'approved');

alter table public.sales enable row level security;
revoke all on public.sales from public, anon, authenticated;
grant select on public.sales to authenticated;

drop policy if exists "Admins read sales" on public.sales;
create policy "Admins read sales" on public.sales
  for select to authenticated using (public.is_daur_admin());

create or replace function public.submit_sale(p_model_number text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_number text := nullif(trim(p_model_number), '');
  v_sale_id uuid;
begin
  if v_model_number is null then
    raise exception 'A model ID is required';
  end if;
  if not exists (select 1 from public.products where model_number = v_model_number) then
    raise exception 'Product model not found';
  end if;

  insert into public.sales (model_number)
  values (v_model_number)
  returning id into v_sale_id;
  return v_sale_id;
exception when unique_violation then
  raise exception 'A sale request is already pending or this model has already been sold';
end;
$$;

create or replace function public.approve_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_daur_admin() then
    raise exception 'Daur admin role required';
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
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_sale_id;
end;
$$;

create or replace function public.reject_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_daur_admin() then
    raise exception 'Daur admin role required';
  end if;

  select status into v_status
  from public.sales
  where id = p_sale_id
  for update;
  if not found then
    raise exception 'Sale request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending sale requests can be rejected';
  end if;

  update public.sales
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_sale_id;
end;
$$;

revoke all on function public.submit_sale(text) from public, anon, authenticated;
revoke all on function public.approve_sale(uuid) from public, anon, authenticated;
revoke all on function public.reject_sale(uuid) from public, anon, authenticated;
grant execute on function public.submit_sale(text) to anon, authenticated;
grant execute on function public.approve_sale(uuid) to authenticated;
grant execute on function public.reject_sale(uuid) to authenticated;

-- The calculator can look up products, but an approved sale is shown as sold
-- and cannot be estimated again. Pending requests remain visible to staff.
drop function if exists public.lookup_product(text);
create function public.lookup_product(p_code text)
returns table (
  model_number text,
  net_weight numeric,
  diamond_weight numeric,
  stone_weight numeric,
  purity text,
  description text,
  labor_charge numeric,
  sale_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.model_number, p.net_weight, p.diamond_weight, p.stone_weight,
         p.purity, p.description, p.labor_charge,
         case
           when exists (
             select 1 from public.sales s
             where s.model_number = p.model_number and s.status = 'approved'
           ) then 'sold'
           when exists (
             select 1 from public.sales s
             where s.model_number = p.model_number and s.status = 'pending'
           ) then 'pending'
           else 'available'
         end
  from public.products p
  where p.model_number = p_code or p.qr_value = p_code
  limit 1;
$$;

revoke all on function public.lookup_product(text) from public;
grant execute on function public.lookup_product(text) to anon, authenticated;
