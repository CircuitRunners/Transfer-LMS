import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { nodeId, segmentId } = await request.json();
	if (!nodeId) return json({ error: 'nodeId required' }, { status: 400 });

	if (segmentId) {
		const { data: segments } = await locals.supabase
			.from('node_learning_segments')
			.select('id,position')
			.eq('node_id', nodeId)
			.order('position');
		const ordered = segments ?? [];
		const currentIndex = ordered.findIndex((s: any) => s.id === segmentId);
		if (currentIndex < 0) return json({ error: 'Invalid segment' }, { status: 400 });

		const priorIds = ordered.slice(0, currentIndex).map((s: any) => s.id);
		if (priorIds.length > 0) {
			const { data: priorProgress } = await locals.supabase
				.from('user_node_segment_progress')
				.select('segment_id,passed_at')
				.eq('user_id', user.id)
				.eq('node_id', nodeId)
				.in('segment_id', priorIds);
			const passedSet = new Set(
				(priorProgress ?? [])
					.filter((row: any) => Boolean(row.passed_at))
					.map((row: any) => String(row.segment_id))
			);
			const missing = priorIds.filter((id: string) => !passedSet.has(id));
			if (missing.length > 0) {
				return json({ error: 'Complete previous segment quiz first.' }, { status: 400 });
			}
		}

		const { error: progressError } = await locals.supabase.from('user_node_segment_progress').upsert(
			{
				user_id: user.id,
				node_id: nodeId,
				segment_id: segmentId,
				watched_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,segment_id' }
		);
		if (progressError) return json({ error: progressError.message }, { status: 400 });

		const { error: transitionError } = await locals.supabase.rpc('transition_certification', {
			p_node_id: nodeId,
			p_new_status: 'quiz_pending',
			p_target_user_id: user.id
		});
		if (transitionError) return json({ error: transitionError.message }, { status: 400 });
		return json({ ok: true, status: 'quiz_pending' });
	}

	const [{ data: assessment }, { data: requirement }] = await Promise.all([
		locals.supabase.from('assessments').select('questions').eq('node_id', nodeId).maybeSingle(),
		locals.supabase
			.from('node_checkoff_requirements')
			.select('directions,mentor_checklist,resource_links,evidence_mode')
			.eq('node_id', nodeId)
			.maybeSingle()
	]);

	const hasQuiz = Array.isArray(assessment?.questions) && assessment.questions.length > 0;
	const hasMeaningfulCheckoff = Boolean(
		(requirement?.directions ?? '').trim() ||
			(Array.isArray(requirement?.mentor_checklist) && requirement.mentor_checklist.length > 0) ||
			(Array.isArray(requirement?.resource_links) && requirement.resource_links.length > 0) ||
			requirement?.evidence_mode === 'photo_optional' ||
			requirement?.evidence_mode === 'photo_required'
	);
	const nextStatus = !hasQuiz && !hasMeaningfulCheckoff ? 'completed' : 'quiz_pending';

	const { error } = await locals.supabase.rpc('transition_certification', {
		p_node_id: nodeId,
		p_new_status: nextStatus,
		p_target_user_id: user.id
	});

	if (error) return json({ error: error.message }, { status: 400 });
	return json({ ok: true, status: nextStatus });
};
