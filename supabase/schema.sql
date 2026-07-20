-- GEO Scan — Supabase schema
-- Run this in the Supabase SQL editor for your project.

-- Scans table: one row per business scan (paid or not-yet-paid)
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,                          -- captured at checkout, tied to magic-link auth
  business_name text not null,
  business_domain text,
  business_desc text,
  competitors text[],
  queries text[],

  -- payment
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed')),
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_paise integer not null default 29900,  -- Rs 299.00

  -- scan results
  scan_status text not null default 'not_started' check (scan_status in ('not_started','running','complete','error')),
  results jsonb,                                 -- { platforms, rows, summary, fixes, citation, ts }

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scans_user_id_idx on public.scans(user_id);
create index if not exists scans_email_idx on public.scans(email);
create index if not exists scans_payment_status_idx on public.scans(payment_status);

-- Publishes table: tracks each "auto-implementation" push (WordPress, hosted page, etc.)
create table if not exists public.publishes (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  fix_index integer not null,                    -- which fix from results.fixes[] this corresponds to
  destination text not null check (destination in ('wordpress','hosted_page','copy_paste')),
  status text not null default 'pending' check (status in ('pending','success','error')),
  destination_meta jsonb,                        -- e.g. { siteUrl, editLink } for WP, { slug } for hosted page
  error text,
  created_at timestamptz not null default now()
);

create index if not exists publishes_scan_id_idx on public.publishes(scan_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists scans_set_updated_at on public.scans;
create trigger scans_set_updated_at
  before update on public.scans
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.scans enable row level security;
alter table public.publishes enable row level security;

-- Users can only see their own scans (matched by user_id once logged in)
drop policy if exists "Users can view own scans" on public.scans;
create policy "Users can view own scans"
  on public.scans for select
  using (auth.uid() = user_id);

-- Inserts happen via service role (API routes), not directly from the client
drop policy if exists "Users can view own publishes" on public.publishes;
create policy "Users can view own publishes"
  on public.publishes for select
  using (
    exists (
      select 1 from public.scans
      where scans.id = publishes.scan_id
      and scans.user_id = auth.uid()
    )
  );

-- Note: all writes (insert/update) go through Next.js API routes using the
-- Supabase service role key, which bypasses RLS. Client-side code only ever
-- reads via the anon key + these policies.
