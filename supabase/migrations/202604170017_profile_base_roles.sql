do $$
begin
	if not exists (select 1 from pg_type where typname = 'app_base_role') then
		create type public.app_base_role as enum ('member', 'po_admin', 'admin');
	end if;
end
$$;

alter table public.profiles
	add column if not exists base_role public.app_base_role not null default 'member',
	add column if not exists is_mentor boolean not null default false,
	add column if not exists is_lead boolean not null default false;

update public.profiles
set
	base_role = case
		when role = 'admin' then 'admin'::public.app_base_role
		else 'member'::public.app_base_role
	end,
	is_mentor = role = 'mentor',
	is_lead = role = 'student_lead'
where
	base_role is distinct from case when role = 'admin' then 'admin'::public.app_base_role else 'member'::public.app_base_role end
	or is_mentor is distinct from (role = 'mentor')
	or is_lead is distinct from (role = 'student_lead');
