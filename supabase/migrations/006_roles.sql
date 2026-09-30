-- Account roles: 'admin' or 'member'. Only the service role (edge functions / SQL) can change it:
-- hub_profiles has no insert/update policy for clients.
alter table public.hub_profiles
  add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

-- locbignood113 is the only admin; make sure the profile row exists even if the account never opened the hub.
insert into public.hub_profiles (id, username, name, avatar, role)
select u.id, 'locbignood113', coalesce(u.raw_user_meta_data->>'full_name', 'locbignood113'), '', 'admin'
from auth.users u
where u.email = 'locbignood113@players.royalpoker.test'
on conflict (id) do update set role = 'admin';

update public.hub_profiles set role = 'member' where username <> 'locbignood113';
