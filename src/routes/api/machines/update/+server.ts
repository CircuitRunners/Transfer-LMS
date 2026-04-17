import { json, type RequestHandler } from '@sveltejs/kit';
import { isMentor } from '$lib/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { profile } = await locals.safeGetSession();
	if (!profile || !isMentor(profile)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const machineId = String(body?.machineId ?? '').trim();
	const name = String(body?.name ?? '').trim();
	const description = String(body?.description ?? '').trim();
	const location = String(body?.location ?? '').trim();
	const requiredNodeIds = Array.isArray(body?.requiredNodeIds)
		? body.requiredNodeIds.map((v: unknown) => String(v)).filter(Boolean)
		: [];

	if (!machineId) return json({ error: 'Machine id is required.' }, { status: 400 });
	if (!name) return json({ error: 'Machine name is required.' }, { status: 400 });

	const { data, error } = await locals.supabase
		.from('machines')
		.update({
			name,
			description,
			location,
			required_node_ids: requiredNodeIds
		})
		.eq('id', machineId)
		.select('id,name,description,location,required_node_ids,qr_token')
		.single();

	if (error) return json({ error: error.message }, { status: 400 });
	return json({ ok: true, machine: data });
};
