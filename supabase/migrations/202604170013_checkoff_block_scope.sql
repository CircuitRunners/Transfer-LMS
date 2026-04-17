alter table public.checkoff_submissions
	add column if not exists block_id uuid references public.node_blocks (id) on delete cascade;

alter table public.checkoff_reviews
	add column if not exists block_id uuid references public.node_blocks (id) on delete cascade;

alter table public.checkoff_submissions
	drop constraint if exists checkoff_submissions_user_id_node_id_key;

alter table public.checkoff_reviews
	drop constraint if exists checkoff_reviews_user_id_node_id_key;

create unique index if not exists ux_checkoff_submissions_legacy
	on public.checkoff_submissions (user_id, node_id)
	where block_id is null;

create unique index if not exists ux_checkoff_submissions_block
	on public.checkoff_submissions (user_id, node_id, block_id)
	where block_id is not null;

create unique index if not exists ux_checkoff_reviews_legacy
	on public.checkoff_reviews (user_id, node_id)
	where block_id is null;

create unique index if not exists ux_checkoff_reviews_block
	on public.checkoff_reviews (user_id, node_id, block_id)
	where block_id is not null;

create index if not exists idx_checkoff_submissions_node_user_block
	on public.checkoff_submissions (node_id, user_id, block_id, updated_at desc);

create index if not exists idx_checkoff_reviews_node_user_block
	on public.checkoff_reviews (node_id, user_id, block_id, updated_at desc);
