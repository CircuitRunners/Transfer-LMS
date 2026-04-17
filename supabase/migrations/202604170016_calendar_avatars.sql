-- Avatar URLs on profiles
alter table public.profiles
	add column if not exists avatar_url text not null default '';

-- Shop shift availability
create table if not exists public.shop_shift_availability (
	user_id uuid not null references public.profiles (id) on delete cascade,
	shift_date date not null,
	shift_number smallint not null check (shift_number in (1, 2)),
	created_at timestamptz not null default now(),
	primary key (user_id, shift_date, shift_number)
);

create index if not exists shop_shift_availability_date_idx
	on public.shop_shift_availability (shift_date, shift_number);
create index if not exists shop_shift_availability_user_idx
	on public.shop_shift_availability (user_id);

alter table public.shop_shift_availability enable row level security;

drop policy if exists shop_shift_availability_select on public.shop_shift_availability;
create policy shop_shift_availability_select on public.shop_shift_availability
	for select
	using (
		user_id = auth.uid()
		or exists (
			select 1 from public.profiles me
			where me.id = auth.uid() and me.role = 'admin'
		)
		or exists (
			select 1
			from public.profiles me
			join public.profiles them on them.id = public.shop_shift_availability.user_id
			where me.id = auth.uid()
			  and me.role in ('mentor', 'student_lead')
			  and me.subteam_id is not null
			  and me.subteam_id = them.subteam_id
		)
	);

drop policy if exists shop_shift_availability_insert on public.shop_shift_availability;
create policy shop_shift_availability_insert on public.shop_shift_availability
	for insert
	with check (user_id = auth.uid());

drop policy if exists shop_shift_availability_delete on public.shop_shift_availability;
create policy shop_shift_availability_delete on public.shop_shift_availability
	for delete
	using (user_id = auth.uid());
