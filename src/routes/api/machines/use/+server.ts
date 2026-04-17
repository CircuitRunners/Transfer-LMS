import { json, type RequestHandler } from '@sveltejs/kit';

const normalizeMachineToken = (value: unknown) => {
	const raw = String(value ?? '').trim();
	if (!raw) return '';

	try {
		const parsed = new URL(raw, 'http://localhost');
		const fromQuery = parsed.searchParams.get('machine');
		if (fromQuery) return fromQuery.trim();
	} catch {
		// Fallback to raw string if not URL-shaped.
	}

	return raw;
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const machineToken = normalizeMachineToken(body?.machineToken);
	if (!machineToken) return json({ error: 'Machine QR token is required.' }, { status: 400 });

	const { data: machine } = await locals.supabase
		.from('machines')
		.select('id,name,description,required_node_ids')
		.eq('qr_token', machineToken)
		.maybeSingle();
	if (!machine) return json({ error: 'Machine not found for this QR.' }, { status: 404 });

	const requiredNodeIds = Array.isArray(machine.required_node_ids) ? machine.required_node_ids : [];
	let missingCount = 0;
	if (requiredNodeIds.length > 0) {
		const { data: completed } = await locals.supabase
			.from('certifications')
			.select('node_id')
			.eq('user_id', user.id)
			.eq('status', 'completed')
			.in('node_id', requiredNodeIds);
		const completedSet = new Set((completed ?? []).map((row: any) => String(row.node_id)));
		missingCount = requiredNodeIds.filter((id: string) => !completedSet.has(String(id))).length;
	}

	const authorized = missingCount === 0;
	await locals.supabase.from('machine_usage_events').insert({
		machine_id: machine.id,
		user_id: user.id,
		authorized,
		details: authorized
			? 'Authorized use via QR'
			: `Denied use via QR: missing ${missingCount} required training module(s).`
	});

	if (!authorized) {
		return json(
			{
				error: `You are missing ${missingCount} required completed training module(s) for ${machine.name}.`,
				machine
			},
			{ status: 403 }
		);
	}

	return json({ ok: true, machine, message: `Authorized to use ${machine.name}.` });
};
