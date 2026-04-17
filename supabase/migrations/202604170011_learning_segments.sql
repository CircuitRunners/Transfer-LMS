create table if not exists public.node_learning_segments (
	id uuid primary key default gen_random_uuid(),
	node_id uuid not null references public.nodes (id) on delete cascade,
	position int not null check (position >= 1),
	title text not null default '',
	video_url text not null default '',
	start_seconds int not null default 0 check (start_seconds >= 0),
	end_seconds int check (end_seconds is null or end_seconds > start_seconds),
	passing_score int not null default 80 check (passing_score between 1 and 100),
	questions jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (node_id, position)
);

create index if not exists idx_node_learning_segments_node_position
	on public.node_learning_segments (node_id, position);

create table if not exists public.user_node_segment_progress (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles (id) on delete cascade,
	node_id uuid not null references public.nodes (id) on delete cascade,
	segment_id uuid not null references public.node_learning_segments (id) on delete cascade,
	watched_at timestamptz,
	passed_at timestamptz,
	best_score int,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (user_id, segment_id)
);

create table if not exists public.segment_quiz_attempts (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles (id) on delete cascade,
	node_id uuid not null references public.nodes (id) on delete cascade,
	segment_id uuid not null references public.node_learning_segments (id) on delete cascade,
	answers jsonb not null default '{}'::jsonb,
	score int not null check (score between 0 and 100),
	passed boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists idx_segment_quiz_attempts_user_segment_created
	on public.segment_quiz_attempts (user_id, segment_id, created_at desc);

alter table public.node_learning_segments enable row level security;
alter table public.user_node_segment_progress enable row level security;
alter table public.segment_quiz_attempts enable row level security;

drop policy if exists "node_learning_segments_read" on public.node_learning_segments;
create policy "node_learning_segments_read" on public.node_learning_segments
	for select
	using (auth.role() = 'authenticated');

drop policy if exists "node_learning_segments_mentor_write" on public.node_learning_segments;
create policy "node_learning_segments_mentor_write" on public.node_learning_segments
	for all
	using (public.is_mentor_or_admin())
	with check (public.is_mentor_or_admin());

drop policy if exists "user_node_segment_progress_select_own_or_mentor" on public.user_node_segment_progress;
create policy "user_node_segment_progress_select_own_or_mentor" on public.user_node_segment_progress
	for select
	using (user_id = auth.uid() or public.is_mentor_or_admin());

drop policy if exists "user_node_segment_progress_student_insert" on public.user_node_segment_progress;
create policy "user_node_segment_progress_student_insert" on public.user_node_segment_progress
	for insert
	with check (user_id = auth.uid());

drop policy if exists "user_node_segment_progress_student_update" on public.user_node_segment_progress;
create policy "user_node_segment_progress_student_update" on public.user_node_segment_progress
	for update
	using (user_id = auth.uid())
	with check (user_id = auth.uid());

drop policy if exists "segment_quiz_attempts_own_or_mentor_read" on public.segment_quiz_attempts;
create policy "segment_quiz_attempts_own_or_mentor_read" on public.segment_quiz_attempts
	for select
	using (user_id = auth.uid() or public.is_mentor_or_admin());

drop policy if exists "segment_quiz_attempts_student_insert" on public.segment_quiz_attempts;
create policy "segment_quiz_attempts_student_insert" on public.segment_quiz_attempts
	for insert
	with check (user_id = auth.uid());
