-- Daur Calculator shared database. Run once in Supabase SQL Editor.
create table if not exists public.products (
  model_number text primary key,
  qr_value text not null unique,
  net_weight numeric(12,3) not null default 0 check (net_weight >= 0),
  diamond_weight numeric(12,3) not null default 0 check (diamond_weight >= 0),
  stone_weight numeric(12,3) not null default 0 check (stone_weight >= 0),
  purity text not null check (purity in ('14', '18')),
  description text not null default '',
  labor_charge numeric(12,2) not null default 0 check (labor_charge >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_card (
  id boolean primary key default true check (id),
  gold_rate_24 numeric(12,2) not null default 9370 check (gold_rate_24 > 0),
  gold_14_factor numeric(8,5) not null default 0.60 check (gold_14_factor >= 0),
  gold_18_factor numeric(8,5) not null default 0.76 check (gold_18_factor >= 0),
  diamond_rate numeric(12,2) not null default 35000 check (diamond_rate >= 0),
  stone_rate numeric(12,2) not null default 0 check (stone_rate >= 0),
  making_rate numeric(8,5) not null default 0.18 check (making_rate >= 0),
  gst_rate numeric(8,5) not null default 0.03 check (gst_rate >= 0),
  rhodium_charge numeric(12,2) not null default 1200 check (rhodium_charge >= 0),
  certificate_charge numeric(12,2) not null default 1500 check (certificate_charge >= 0),
  updated_at timestamptz not null default now()
);

insert into public.rate_card (id) values (true) on conflict (id) do nothing;

create or replace function public.is_daur_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'daur_role') = 'admin', false);
$$;

alter table public.products enable row level security;
alter table public.rate_card enable row level security;
grant usage on schema public to anon, authenticated;

revoke all on public.products from anon, authenticated;
revoke all on public.rate_card from anon, authenticated;
grant select on public.rate_card to anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant update on public.rate_card to authenticated;

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products
  for all to authenticated
  using (public.is_daur_admin())
  with check (public.is_daur_admin());

drop policy if exists "Anyone reads the rate card" on public.rate_card;
create policy "Anyone reads the rate card" on public.rate_card
  for select to anon, authenticated using (true);

drop policy if exists "Admins update the rate card" on public.rate_card;
create policy "Admins update the rate card" on public.rate_card
  for update to authenticated
  using (public.is_daur_admin())
  with check (public.is_daur_admin());

create or replace function public.lookup_product(p_code text)
returns table (
  model_number text,
  net_weight numeric,
  diamond_weight numeric,
  stone_weight numeric,
  purity text,
  description text,
  labor_charge numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.model_number, p.net_weight, p.diamond_weight, p.stone_weight,
         p.purity, p.description, p.labor_charge
  from public.products as p
  where p.model_number = p_code or p.qr_value = p_code
  limit 1;
$$;

revoke all on function public.lookup_product(text) from public;
grant execute on function public.lookup_product(text) to anon, authenticated;
