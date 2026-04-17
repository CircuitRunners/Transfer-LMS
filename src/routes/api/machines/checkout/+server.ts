import { json, type RequestHandler } from '@sveltejs/kit';
import { jwtVerify } from 'jose';
import { isMentor } from '$lib/roles';

const encoder = new TextEncoder();

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile || !isMentor(profile)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const { machineId, qrToken, notes } = await request.json();
	if (!machineId || !qrToken) return json({ error: 'machineId and qrToken are required' }, { status: 400 });

	let studentId = '';
	try {
		const { payload } = await jwtVerify(
			String(qrToken),
			encoder.encode(process.env.PASSPORT_QR_SECRET ?? 'dev-secret-change-me')
		);
		studentId = String(payload.user_id ?? '');
	} catch {
		return json({ error: 'Invalid or expired passport QR token.' }, { status: 400 });
	}
	if (!studentId) return json({ error: 'Could not resolve student from QR token.' }, { status: 400 });

	const { data: machine } = await locals.supabase
		.from('machines')
		.select('id,name,required_node_ids')
		.eq('id', machineId)
		.maybeSingle();
	if (!machine) return json({ error: 'Machine not found.' }, { status: 404 });

	const requiredNodeIds = Array.isArray(machine.required_node_ids) ? machine.required_node_ids : [];
	if (requiredNodeIds.length > 0) {
		const { data: completed } = await locals.supabase
			.from('certifications')
			.select('node_id')
			.eq('user_id', studentId)
			.eq('status', 'completed')
			.in('node_id', requiredNodeIds);
		const completedSet = new Set((completed ?? []).map((row: any) => row.node_id));
		const missing = requiredNodeIds.filter((id: string) => !completedSet.has(id));
		if (missing.length > 0) {
			return json(
				{
					error: `Student is missing ${missing.length} required certification(s) for ${machine.name}.`
				},
				{ status: 403 }
			);
		}
	}

	const { data: existingOpen } = await locals.supabase
		.from('machine_checkout_sessions')
		.select('id')
		.eq('machine_id', machineId)
		.eq('student_id', studentId)
		.is('ended_at', null)
		.maybeSingle();
	if (existingOpen) return json({ error: 'This student already has this machine checked out.' }, { status: 409 });

	const { data: session, error } = await locals.supabase
		.from('machine_checkout_sessions')
		.insert({
			machine_id: machineId,
			student_id: studentId,
			mentor_id: user.id,
			notes: String(notes ?? '')
		})
		.select('*')
		.single();

	if (error) return json({ error: error.message }, { status: 400 });
	return json({ ok: true, session });
};
