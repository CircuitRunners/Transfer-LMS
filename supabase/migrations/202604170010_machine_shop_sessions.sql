create table if not exists public.machine_checkout_sessions (
	id uuid primary key default gen_random_uuid(),
	machine_id uuid not null references public.machines (id) on delete cascade,
	student_id uuid not null references public.profiles (id) on delete cascade,
	mentor_id uuid not null references public.profiles (id) on delete restrict,
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	notes text not null default ''
);

create index if not exists idx_machine_checkout_sessions_open
	on public.machine_checkout_sessions (machine_id, student_id)
	where ended_at is null;

alter table public.machine_checkout_sessions enable row level security;

drop policy if exists "machine_checkout_sessions_select" on public.machine_checkout_sessions;
create policy "machine_checkout_sessions_select" on public.machine_checkout_sessions
	for select
	using (public.is_mentor_or_admin() or student_id = auth.uid());

drop policy if exists "machine_checkout_sessions_mentor_insert" on public.machine_checkout_sessions;
create policy "machine_checkout_sessions_mentor_insert" on public.machine_checkout_sessions
	for insert
	with check (public.is_mentor_or_admin() and mentor_id = auth.uid());

drop policy if exists "machine_checkout_sessions_mentor_update" on public.machine_checkout_sessions;
create policy "machine_checkout_sessions_mentor_update" on public.machine_checkout_sessions
	for update
	using (public.is_mentor_or_admin())
	with check (public.is_mentor_or_admin());
