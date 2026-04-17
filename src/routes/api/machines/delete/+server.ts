import { json, type RequestHandler } from '@sveltejs/kit';
import { isMentor } from '$lib/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { profile } = await locals.safeGetSession();
	if (!profile || !isMentor(profile)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const machineId = String(body?.machineId ?? '').trim();
	if (!machineId) return json({ error: 'Machine id is required.' }, { status: 400 });

	const { error } = await locals.supabase.from('machines').delete().eq('id', machineId);
	if (error) return json({ error: error.message }, { status: 400 });
	return json({ ok: true });
};
