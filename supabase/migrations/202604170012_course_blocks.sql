do $$ begin
	if not exists (select 1 from pg_type where typname = 'node_block_type') then
		create type public.node_block_type as enum ('video', 'quiz', 'checkoff');
	end if;
end $$;

create table if not exists public.node_blocks (
	id uuid primary key default gen_random_uuid(),
	node_id uuid not null references public.nodes (id) on delete cascade,
	position int not null check (position >= 1),
	type public.node_block_type not null,
	config jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (node_id, position)
);

create index if not exists idx_node_blocks_node_position
	on public.node_blocks (node_id, position);

create table if not exists public.user_node_block_progress (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles (id) on delete cascade,
	node_id uuid not null references public.nodes (id) on delete cascade,
	block_id uuid not null references public.node_blocks (id) on delete cascade,
	completed_at timestamptz,
	best_score int,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (user_id, block_id)
);

create table if not exists public.block_quiz_attempts (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles (id) on delete cascade,
	node_id uuid not null references public.nodes (id) on delete cascade,
	block_id uuid not null references public.node_blocks (id) on delete cascade,
	answers jsonb not null default '{}'::jsonb,
	score int not null check (score between 0 and 100),
	passed boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists idx_block_quiz_attempts_user_block_created
	on public.block_quiz_attempts (user_id, block_id, created_at desc);

alter table public.node_blocks enable row level security;
alter table public.user_node_block_progress enable row level security;
alter table public.block_quiz_attempts enable row level security;

drop policy if exists "node_blocks_read" on public.node_blocks;
create policy "node_blocks_read" on public.node_blocks
	for select using (auth.role() = 'authenticated');

drop policy if exists "node_blocks_mentor_write" on public.node_blocks;
create policy "node_blocks_mentor_write" on public.node_blocks
	for all using (public.is_mentor_or_admin()) with check (public.is_mentor_or_admin());

drop policy if exists "user_node_block_progress_select_own_or_mentor" on public.user_node_block_progress;
create policy "user_node_block_progress_select_own_or_mentor" on public.user_node_block_progress
	for select using (user_id = auth.uid() or public.is_mentor_or_admin());

drop policy if exists "user_node_block_progress_student_insert" on public.user_node_block_progress;
create policy "user_node_block_progress_student_insert" on public.user_node_block_progress
	for insert with check (user_id = auth.uid());

drop policy if exists "user_node_block_progress_student_update" on public.user_node_block_progress;
create policy "user_node_block_progress_student_update" on public.user_node_block_progress
	for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "block_quiz_attempts_own_or_mentor_read" on public.block_quiz_attempts;
create policy "block_quiz_attempts_own_or_mentor_read" on public.block_quiz_attempts
	for select using (user_id = auth.uid() or public.is_mentor_or_admin());

drop policy if exists "block_quiz_attempts_student_insert" on public.block_quiz_attempts;
create policy "block_quiz_attempts_student_insert" on public.block_quiz_attempts
	for insert with check (user_id = auth.uid());

create or replace function public.try_auto_complete_node(
	p_node_id uuid,
	p_target_user_id uuid default null
)
returns public.certifications
language plpgsql
security definer
set search_path = public
as $$
declare
	v_target uuid := coalesce(p_target_user_id, auth.uid());
	v_cert public.certifications;
	v_total_blocks int;
	v_completed_blocks int;
	v_pending_checkoff int;
	v_has_checkoff_block boolean;
begin
	if v_target is null then
		raise exception 'Unauthenticated';
	end if;

	select * into v_cert
	from public.certifications
	where user_id = v_target and node_id = p_node_id
	for update;
	if not found then
		raise exception 'Certification row missing';
	end if;

	select count(*) into v_total_blocks
	from public.node_blocks
	where node_id = p_node_id;

	if v_total_blocks = 0 then
		return v_cert;
	end if;

	select count(*) into v_completed_blocks
	from public.node_blocks b
	join public.user_node_block_progress p
		on p.block_id = b.id and p.user_id = v_target
	where b.node_id = p_node_id and p.completed_at is not null;

	select exists (
		select 1 from public.node_blocks
		where node_id = p_node_id and type = 'checkoff'
	) into v_has_checkoff_block;

	select count(*) into v_pending_checkoff
	from public.checkoff_reviews r
	where r.node_id = p_node_id and r.user_id = v_target
		and r.status in ('needs_review', 'blocked');

	if v_completed_blocks >= v_total_blocks and v_pending_checkoff = 0 then
		update public.certifications
		set status = 'completed',
			approved_by = coalesce(v_cert.approved_by, auth.uid()),
			approved_at = coalesce(v_cert.approved_at, now())
		where id = v_cert.id
		returning * into v_cert;
	end if;

	return v_cert;
end;
$$;

grant execute on function public.try_auto_complete_node(uuid, uuid) to authenticated;
