import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { profile } = await locals.safeGetSession();
	if (!profile || !['mentor', 'admin'].includes(profile.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const { sessionId } = await request.json();
	if (!sessionId) return json({ error: 'sessionId is required' }, { status: 400 });

	const { error } = await locals.supabase
		.from('machine_checkout_sessions')
		.update({ ended_at: new Date().toISOString() })
		.eq('id', sessionId)
		.is('ended_at', null);

	if (error) return json({ error: error.message }, { status: 400 });
	return json({ ok: true });
};
