-- Run once in Supabase SQL Editor to add upload batches to an existing project.
-- Existing product rows are grouped in one clearly marked legacy batch because
-- their original upload history was not stored.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  product_count integer not null default 0 check (product_count >= 0),
  is_legacy boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.import_batch_products (
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  model_number text not null,
  product_data jsonb not null,
  primary key (batch_id, model_number)
);

alter table public.import_batches enable row level security;
alter table public.import_batch_products enable row level security;
revoke all on public.import_batches from anon, authenticated;
revoke all on public.import_batch_products from anon, authenticated;
grant select on public.import_batches, public.import_batch_products to authenticated;

drop policy if exists "Admins read import batches" on public.import_batches;
create policy "Admins read import batches" on public.import_batches
  for select to authenticated using (public.is_daur_admin());
drop policy if exists "Admins read batch products" on public.import_batch_products;
create policy "Admins read batch products" on public.import_batch_products
  for select to authenticated using (public.is_daur_admin());

create or replace function public.import_products_batch(p_file_name text, p_products jsonb)
returns table (batch_id uuid, imported_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_count integer;
begin
  if not public.is_daur_admin() then
    raise exception 'Daur admin role required';
  end if;
  if jsonb_typeof(p_products) is distinct from 'array' or jsonb_array_length(p_products) = 0 then
    raise exception 'At least one product is required';
  end if;

  v_count := jsonb_array_length(p_products);
  insert into public.import_batches (file_name, product_count)
  values (coalesce(nullif(trim(p_file_name), ''), 'Excel import.xlsx'), v_count)
  returning id into v_batch_id;

  insert into public.products (
    model_number, qr_value, net_weight, diamond_weight, stone_weight,
    purity, description, labor_charge, updated_at
  )
  select x.model_number, x.qr_value, x.net_weight, x.diamond_weight, x.stone_weight,
         x.purity, x.description, x.labor_charge, coalesce(x.updated_at, now())
  from jsonb_to_recordset(p_products) as x(
    model_number text, qr_value text, net_weight numeric, diamond_weight numeric,
    stone_weight numeric, purity text, description text, labor_charge numeric,
    updated_at timestamptz
  )
  on conflict (model_number) do update set
    qr_value = excluded.qr_value,
    net_weight = excluded.net_weight,
    diamond_weight = excluded.diamond_weight,
    stone_weight = excluded.stone_weight,
    purity = excluded.purity,
    description = excluded.description,
    labor_charge = excluded.labor_charge,
    updated_at = excluded.updated_at;

  insert into public.import_batch_products (batch_id, model_number, product_data)
  select v_batch_id, x.model_number, to_jsonb(x)
  from jsonb_to_recordset(p_products) as x(
    model_number text, qr_value text, net_weight numeric, diamond_weight numeric,
    stone_weight numeric, purity text, description text, labor_charge numeric,
    updated_at timestamptz
  );

  return query select v_batch_id, v_count;
end;
$$;

create or replace function public.delete_import_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_snapshot jsonb;
  v_removed integer;
begin
  if not public.is_daur_admin() then
    raise exception 'Daur admin role required';
  end if;
  if not exists (select 1 from public.import_batches where id = p_batch_id) then
    raise exception 'Import batch not found';
  end if;

  -- If a model was also imported in another batch, restore its most recent
  -- remaining snapshot before removing this batch's link.
  for v_item in
    select model_number
    from public.import_batch_products
    where batch_id = p_batch_id
      and exists (
        select 1 from public.import_batch_products other
        where other.model_number = import_batch_products.model_number
          and other.batch_id <> p_batch_id
      )
  loop
    select bip.product_data into v_snapshot
    from public.import_batch_products bip
    join public.import_batches b on b.id = bip.batch_id
    where bip.model_number = v_item.model_number and bip.batch_id <> p_batch_id
    order by b.created_at desc
    limit 1;

    update public.products set
      qr_value = v_snapshot->>'qr_value',
      net_weight = (v_snapshot->>'net_weight')::numeric,
      diamond_weight = (v_snapshot->>'diamond_weight')::numeric,
      stone_weight = (v_snapshot->>'stone_weight')::numeric,
      purity = v_snapshot->>'purity',
      description = coalesce(v_snapshot->>'description', ''),
      labor_charge = (v_snapshot->>'labor_charge')::numeric,
      updated_at = coalesce((v_snapshot->>'updated_at')::timestamptz, now())
    where model_number = v_item.model_number;
  end loop;

  delete from public.products p
  where exists (
    select 1 from public.import_batch_products current_batch
    where current_batch.batch_id = p_batch_id and current_batch.model_number = p.model_number
  )
  and not exists (
    select 1 from public.import_batch_products other_batch
    where other_batch.batch_id <> p_batch_id and other_batch.model_number = p.model_number
  );
  get diagnostics v_removed = row_count;

  delete from public.import_batches where id = p_batch_id;
  return v_removed;
end;
$$;

revoke all on function public.import_products_batch(text, jsonb) from public;
revoke all on function public.delete_import_batch(uuid) from public;
grant execute on function public.import_products_batch(text, jsonb) to authenticated;
grant execute on function public.delete_import_batch(uuid) to authenticated;

do $$
declare
  v_batch_id uuid;
  v_count integer;
begin
  select count(*) into v_count from public.products;
  if v_count > 0 and not exists (select 1 from public.import_batches) then
    insert into public.import_batches (file_name, product_count, is_legacy)
    values ('Existing products (upload history unavailable)', v_count, true)
    returning id into v_batch_id;
    insert into public.import_batch_products (batch_id, model_number, product_data)
    select v_batch_id, p.model_number, to_jsonb(p) from public.products p;
  end if;
end;
$$;
