import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { nodeId, blockId } = await request.json();
	if (!nodeId || !blockId) {
		return json({ error: 'nodeId and blockId are required' }, { status: 400 });
	}

	const [{ data: blocks }, { data: cert }, { data: computed }] = await Promise.all([
		locals.supabase
			.from('node_blocks')
			.select('id,position,type')
			.eq('node_id', nodeId)
			.order('position'),
		locals.supabase
			.from('certifications')
			.select('status')
			.eq('node_id', nodeId)
			.eq('user_id', user.id)
			.maybeSingle(),
		locals.supabase
			.from('v_user_node_status')
			.select('computed_status')
			.eq('node_id', nodeId)
			.eq('user_id', user.id)
			.maybeSingle()
	]);
	if (!cert) return json({ error: 'Certification missing' }, { status: 400 });
	const effectiveStatus = String(computed?.computed_status ?? cert?.status ?? 'locked');
	if (effectiveStatus === 'locked') {
		return json({ error: 'Complete prerequisites first.' }, { status: 400 });
	}

	const blockRows = blocks ?? [];
	const activeBlock = blockRows.find((b: any) => b.id === blockId);
	if (!activeBlock) return json({ error: 'Invalid block for this module.' }, { status: 400 });
	if (activeBlock.type === 'quiz') {
		return json({ error: 'Use the quiz submission flow for quiz blocks.' }, { status: 400 });
	}

	const prior = blockRows.filter((b: any) => Number(b.position) < Number(activeBlock.position));
	if (prior.length > 0) {
		const { data: priorProgress } = await locals.supabase
			.from('user_node_block_progress')
			.select('block_id,completed_at')
			.eq('user_id', user.id)
			.eq('node_id', nodeId)
			.in(
				'block_id',
				prior.map((p: any) => p.id)
			);
		const done = new Set(
			(priorProgress ?? [])
				.filter((row: any) => Boolean(row.completed_at))
				.map((row: any) => String(row.block_id))
		);
		const missing = prior.filter((p: any) => !done.has(String(p.id)));
		if (missing.length > 0) {
			return json({ error: 'Complete previous blocks first.' }, { status: 400 });
		}
	}

	if (activeBlock.type === 'video') {
		const { error: upsertErr } = await locals.supabase.from('user_node_block_progress').upsert(
			{
				user_id: user.id,
				node_id: nodeId,
				block_id: activeBlock.id,
				completed_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,block_id' }
		);
		if (upsertErr) return json({ error: upsertErr.message }, { status: 400 });

		if (cert.status === 'available') {
			await locals.supabase.rpc('transition_certification', {
				p_node_id: nodeId,
				p_new_status: 'video_pending',
				p_target_user_id: user.id
			});
		}
		await locals.supabase.rpc('try_auto_complete_node', {
			p_node_id: nodeId,
			p_target_user_id: user.id
		});
		return json({ ok: true });
	}

	return json({ ok: true });
};
