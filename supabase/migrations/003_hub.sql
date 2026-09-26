-- Game Hub schema. Shares the Supabase project (and auth users) with Royal Poker.
-- Every object is prefixed hub_ so it can live next to poker_* and the other apps' tables.

-- Profiles ------------------------------------------------------------------
create table if not exists public.hub_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  name text not null,
  avatar text not null default '',
  created_at timestamptz not null default now()
);
alter table public.hub_profiles enable row level security;
drop policy if exists "hub_profiles readable" on public.hub_profiles;
create policy "hub_profiles readable" on public.hub_profiles for select to authenticated using (true);

-- Rooms (public state is readable; hidden state lives in hub_room_private) --------
create table if not exists public.hub_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game text not null,
  status text not null default 'waiting',
  host_id uuid references auth.users(id) on delete set null,
  state jsonb not null,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hub_rooms_game_status_idx on public.hub_rooms (game, status, updated_at desc);
create index if not exists hub_rooms_host_idx on public.hub_rooms (host_id);
alter table public.hub_rooms enable row level security;
drop policy if exists "hub_rooms readable" on public.hub_rooms;
create policy "hub_rooms readable" on public.hub_rooms for select to authenticated using (true);

create table if not exists public.hub_room_private (
  room_id uuid primary key references public.hub_rooms(id) on delete cascade,
  state jsonb not null default '{}'::jsonb
);
alter table public.hub_room_private enable row level security; -- no policies: server only

-- Ratings & match history -----------------------------------------------------
create table if not exists public.hub_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  games int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
create index if not exists hub_ratings_cat_idx on public.hub_ratings (category, rating desc);
alter table public.hub_ratings enable row level security;
drop policy if exists "hub_ratings readable" on public.hub_ratings;
create policy "hub_ratings readable" on public.hub_ratings for select to authenticated using (true);

create table if not exists public.hub_matches (
  id bigint generated always as identity primary key,
  game text not null,
  category text,
  room_code text,
  players jsonb not null,
  result jsonb not null,
  rated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hub_matches_created_idx on public.hub_matches (created_at desc);
create index if not exists hub_matches_players_idx on public.hub_matches using gin (players jsonb_path_ops);
alter table public.hub_matches enable row level security;
drop policy if exists "hub_matches readable" on public.hub_matches;
create policy "hub_matches readable" on public.hub_matches for select to authenticated using (true);

-- Solo game sessions & scores ---------------------------------------------------
create table if not exists public.hub_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  mode text not null,
  seed bigint not null,
  started_at timestamptz not null default now(),
  used boolean not null default false
);
create index if not exists hub_sessions_user_idx on public.hub_sessions (user_id, started_at desc);
alter table public.hub_sessions enable row level security; -- server only

create table if not exists public.hub_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  mode text not null,
  score bigint not null default 0,
  time_ms int,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists hub_scores_score_idx on public.hub_scores (game, mode, score desc);
create index if not exists hub_scores_time_idx on public.hub_scores (game, mode, time_ms asc);
create index if not exists hub_scores_user_idx on public.hub_scores (user_id, game, mode);
alter table public.hub_scores enable row level security;
drop policy if exists "hub_scores readable" on public.hub_scores;
create policy "hub_scores readable" on public.hub_scores for select to authenticated using (true);

-- Best score per player. Higher is better unless p_lower_is_better (time-based games).
create or replace function public.hub_leaderboard(
  p_game text, p_mode text, p_since timestamptz default null, p_limit int default 50, p_lower_is_better boolean default false
) returns table (user_id uuid, name text, username text, score bigint, time_ms int, meta jsonb, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with ranked as (
    select s.*, row_number() over (
      partition by s.user_id
      order by case when p_lower_is_better then s.time_ms end asc nulls last,
               case when not p_lower_is_better then s.score end desc nulls last,
               s.created_at asc
    ) as rn
    from hub_scores s
    where s.game = p_game and s.mode = p_mode and (p_since is null or s.created_at >= p_since)
  )
  select r.user_id, coalesce(p.name, 'Người chơi'), coalesce(p.username, ''), r.score, r.time_ms, r.meta, r.created_at
  from ranked r left join hub_profiles p on p.id = r.user_id
  where r.rn = 1
  order by case when p_lower_is_better then r.time_ms end asc nulls last,
           case when not p_lower_is_better then r.score end desc nulls last,
           r.created_at asc
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.hub_leaderboard(text, text, timestamptz, int, boolean) to authenticated;

-- Play-money wallet ---------------------------------------------------------------
create table if not exists public.hub_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chips bigint not null default 10000 check (chips >= 0),
  last_bonus timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hub_wallets enable row level security;
drop policy if exists "hub_wallets readable" on public.hub_wallets;
create policy "hub_wallets readable" on public.hub_wallets for select to authenticated using (true);

create table if not exists public.hub_casino_bets (
  id bigint generated always as identity primary key,
  game text not null,
  round int not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  bets jsonb not null default '[]'::jsonb,
  stake bigint not null default 0,
  auto_cashout numeric,
  cashout numeric,
  payout bigint not null default 0,
  settled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game, round, user_id)
);
create index if not exists hub_casino_bets_user_idx on public.hub_casino_bets (user_id, created_at desc);
alter table public.hub_casino_bets enable row level security;
drop policy if exists "hub_casino_bets own" on public.hub_casino_bets;
create policy "hub_casino_bets own" on public.hub_casino_bets for select to authenticated using ((select auth.uid()) = user_id);

-- Atomic helpers (service role only) ----------------------------------------------
create or replace function public.hub_room_commit(
  p_id uuid, p_expected bigint, p_state jsonb, p_status text, p_private jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update hub_rooms set state = p_state, status = p_status, version = version + 1, updated_at = now()
   where id = p_id and version = p_expected
  returning version into v;
  if v is null then raise exception 'VERSION_CONFLICT'; end if;
  if p_private is not null then
    insert into hub_room_private (room_id, state) values (p_id, p_private)
    on conflict (room_id) do update set state = excluded.state;
  end if;
  return v;
end $$;

create or replace function public.hub_wallet_ensure(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  insert into hub_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select chips into c from hub_wallets where user_id = p_user;
  return c;
end $$;

-- Daily bonus: 5,000 chips once every 20 hours.
create or replace function public.hub_wallet_bonus(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  perform hub_wallet_ensure(p_user);
  update hub_wallets set chips = chips + 5000, last_bonus = now()
   where user_id = p_user and (last_bonus is null or last_bonus < now() - interval '20 hours')
  returning chips into c;
  if c is null then raise exception 'BONUS_NOT_READY'; end if;
  return c;
end $$;

-- Place (or add to) a bet: deducts chips and merges bet lines in one transaction.
create or replace function public.hub_casino_place(
  p_user uuid, p_game text, p_round int, p_bets jsonb, p_stake bigint, p_auto numeric
) returns bigint
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  perform hub_wallet_ensure(p_user);
  update hub_wallets set chips = chips - p_stake where user_id = p_user and chips >= p_stake returning chips into c;
  if c is null then raise exception 'INSUFFICIENT_CHIPS'; end if;
  insert into hub_casino_bets (game, round, user_id, bets, stake, auto_cashout)
  values (p_game, p_round, p_user, p_bets, p_stake, p_auto)
  on conflict (game, round, user_id) do update
    set bets = hub_casino_bets.bets || excluded.bets,
        stake = hub_casino_bets.stake + excluded.stake,
        auto_cashout = coalesce(excluded.auto_cashout, hub_casino_bets.auto_cashout)
    where not hub_casino_bets.settled and hub_casino_bets.cashout is null;
  if not found then raise exception 'BET_CLOSED'; end if;
  return c;
end $$;

-- Crash: manual cash-out at a multiplier, paid immediately (once).
create or replace function public.hub_casino_cashout(
  p_user uuid, p_game text, p_round int, p_mult numeric
) returns bigint
language plpgsql security definer set search_path = public as $$
declare b record; pay bigint;
begin
  select * into b from hub_casino_bets
   where game = p_game and round = p_round and user_id = p_user for update;
  if b is null or b.settled or b.cashout is not null then raise exception 'NO_ACTIVE_BET'; end if;
  pay := floor(b.stake * p_mult);
  update hub_casino_bets set cashout = p_mult, payout = pay where id = b.id;
  update hub_wallets set chips = chips + pay where user_id = p_user;
  return pay;
end $$;

-- Settle a round exactly once. p_payouts = { "<user uuid>": payout, ... } for users not already paid.
create or replace function public.hub_casino_settle(p_game text, p_round int, p_payouts jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare b record; pay bigint;
begin
  for b in select * from hub_casino_bets where game = p_game and round = p_round and not settled for update loop
    pay := coalesce((p_payouts->>(b.user_id::text))::bigint, 0);
    if b.cashout is not null then
      pay := 0; -- crash cash-outs were paid when they happened
    end if;
    update hub_casino_bets set settled = true, payout = payout + pay where id = b.id;
    if pay > 0 then update hub_wallets set chips = chips + pay where user_id = b.user_id; end if;
  end loop;
end $$;

revoke all on function public.hub_room_commit(uuid, bigint, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.hub_wallet_ensure(uuid) from public, anon, authenticated;
revoke all on function public.hub_wallet_bonus(uuid) from public, anon, authenticated;
revoke all on function public.hub_casino_place(uuid, text, int, jsonb, bigint, numeric) from public, anon, authenticated;
revoke all on function public.hub_casino_cashout(uuid, text, int, numeric) from public, anon, authenticated;
revoke all on function public.hub_casino_settle(text, int, jsonb) from public, anon, authenticated;
grant execute on function public.hub_room_commit(uuid, bigint, jsonb, text, jsonb) to service_role;
grant execute on function public.hub_wallet_ensure(uuid) to service_role;
grant execute on function public.hub_wallet_bonus(uuid) to service_role;
grant execute on function public.hub_casino_place(uuid, text, int, jsonb, bigint, numeric) to service_role;
grant execute on function public.hub_casino_cashout(uuid, text, int, numeric) to service_role;
grant execute on function public.hub_casino_settle(text, int, jsonb) to service_role;

-- Realtime: clients subscribe to room changes.
do $$ begin
  alter publication supabase_realtime add table public.hub_rooms;
exception when duplicate_object then null; end $$;
