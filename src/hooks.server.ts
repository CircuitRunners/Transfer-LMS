import { redirect, type Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { isAdmin, isMentor } from '$lib/roles';

const PUBLIC_ROUTES = new Set(['/', '/login']);
const TEAM_EMAIL_DOMAIN = (process.env.TEAM_EMAIL_DOMAIN ?? '').toLowerCase();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseServerClient(event.cookies);
	let cachedSessionResult:
		| Promise<{ session: unknown; user: unknown; profile: unknown }>
		| undefined;

	event.locals.safeGetSession = async () => {
		if (cachedSessionResult) return cachedSessionResult;
		cachedSessionResult = (async () => {
			const {
				data: { session }
			} = await event.locals.supabase.auth.getSession();
			if (!session) return { session: null, user: null, profile: null };

			const { data: claimsData, error: claimsError } = await event.locals.supabase.auth.getClaims();
			const claims = claimsError ? null : claimsData?.claims;
			let user = claims
				? ({
						id: claims.sub ?? null,
						email: typeof claims.email === 'string' ? claims.email : null
					} as const)
				: null;

			if (!user?.id) {
				const {
					data: { user: fetchedUser },
					error: userError
				} = await event.locals.supabase.auth.getUser();
				if (userError || !fetchedUser) return { session: null, user: null, profile: null };
				user = { id: fetchedUser.id, email: fetchedUser.email ?? null } as const;
			}

			if (TEAM_EMAIL_DOMAIN && !user.email?.toLowerCase().endsWith(`@${TEAM_EMAIL_DOMAIN}`)) {
				await event.locals.supabase.auth.signOut();
				throw redirect(303, '/login?error=domain');
			}

			const { data: profile } = await event.locals.supabase
				.from('profiles')
				.select('id,email,full_name,role,base_role,is_mentor,is_lead,subteam_id,bio,avatar_url')
				.eq('id', user.id)
				.single();

			return { session, user, profile: profile ?? null };
		})();
		return cachedSessionResult;
	};

	const { session, profile } = await event.locals.safeGetSession();
	const path = event.url.pathname;
	const isPublicPath = PUBLIC_ROUTES.has(path) || path.startsWith('/auth/');

	if (!session && !isPublicPath) throw redirect(303, '/login');
	if (session && path === '/login') throw redirect(303, '/dashboard');

	if (path.startsWith('/mentor') && profile && !isMentor(profile)) {
		throw redirect(303, '/dashboard');
	}
	if (path.startsWith('/roster') && profile && !isMentor(profile)) {
		throw redirect(303, '/dashboard');
	}
	if (path.startsWith('/admin') && profile && !isAdmin(profile)) {
		throw redirect(303, '/dashboard');
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
