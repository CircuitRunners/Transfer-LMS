import { redirect, type Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

const PUBLIC_ROUTES = new Set(['/', '/login']);
const TEAM_EMAIL_DOMAIN = (process.env.TEAM_EMAIL_DOMAIN ?? '').toLowerCase();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseServerClient(event.cookies);

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null, profile: null };

		const {
			data: { user },
			error: userError
		} = await event.locals.supabase.auth.getUser();

		if (userError || !user) return { session: null, user: null, profile: null };

		if (TEAM_EMAIL_DOMAIN && !user.email?.toLowerCase().endsWith(`@${TEAM_EMAIL_DOMAIN}`)) {
			await event.locals.supabase.auth.signOut();
			throw redirect(303, '/login?error=domain');
		}

		const { data: profile } = await event.locals.supabase
			.from('profiles')
			.select('id,email,full_name,role,subteam_id,bio,avatar_url')
			.eq('id', user.id)
			.single();

		return { session, user, profile: profile ?? null };
	};

	const { session, profile } = await event.locals.safeGetSession();
	const path = event.url.pathname;
	const isPublicPath = PUBLIC_ROUTES.has(path) || path.startsWith('/auth/');

	if (!session && !isPublicPath) throw redirect(303, '/login');
	if (session && path === '/login') throw redirect(303, '/dashboard');

	if (path.startsWith('/mentor') && profile && !['mentor', 'admin'].includes(profile.role)) {
		throw redirect(303, '/dashboard');
	}
	if (path.startsWith('/roster') && profile && !['mentor', 'admin'].includes(profile.role)) {
		throw redirect(303, '/dashboard');
	}
	if (path.startsWith('/admin') && profile && profile.role !== 'admin') {
		throw redirect(303, '/dashboard');
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
