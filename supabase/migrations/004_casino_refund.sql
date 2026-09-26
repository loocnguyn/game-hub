-- Refund bets left unsettled in rounds before p_round (placed in the instant a round was being settled).
create or replace function public.hub_casino_refund_stale(p_game text, p_round int)
returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select * from hub_casino_bets where game = p_game and round < p_round and not settled for update loop
    if b.cashout is null then
      update hub_wallets set chips = chips + b.stake where user_id = b.user_id;
      update hub_casino_bets set settled = true, payout = b.stake where id = b.id;
    else
      update hub_casino_bets set settled = true where id = b.id;
    end if;
  end loop;
end $$;
revoke all on function public.hub_casino_refund_stale(text, int) from public, anon, authenticated;
grant execute on function public.hub_casino_refund_stale(text, int) to service_role;
