alter table public.checkoff_reviews
	drop constraint if exists checkoff_reviews_status_check,
	add constraint checkoff_reviews_status_check check (status in ('approved', 'needs_review', 'blocked'));
