import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile || !['mentor', 'admin'].includes(profile.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const { nodeId, userId, action, notes, checklist_results } = await request.json();
	const normalizedAction = action === 'review' ? 'reset_quiz' : action;
	if (
		!nodeId ||
		!userId ||
		!['approve', 'reset_quiz', 'retry_checkoff', 'block_checkoff'].includes(normalizedAction)
	) {
		return json({ error: 'Invalid request payload' }, { status: 400 });
	}

	if (normalizedAction === 'approve') {
		const [{ data: requirement }, { data: submission }] = await Promise.all([
			locals.supabase
				.from('node_checkoff_requirements')
				.select('evidence_mode')
				.eq('node_id', nodeId)
				.maybeSingle(),
			locals.supabase
				.from('checkoff_submissions')
				.select('photo_data_url,photo_data_urls')
				.eq('node_id', nodeId)
				.eq('user_id', userId)
				.maybeSingle()
		]);
		const hasPhoto = Boolean(
			submission?.photo_data_url ||
				(Array.isArray(submission?.photo_data_urls) && submission.photo_data_urls.length > 0)
		);
		if (!submission) {
			return json({ error: 'Student must submit a checkoff record before approval.' }, { status: 400 });
		}
		if (requirement?.evidence_mode === 'photo_required' && !hasPhoto) {
			return json(
				{ error: 'Photo evidence is required before this checkoff can be approved.' },
				{ status: 400 }
			);
		}
		const requiredChecklist = Array.isArray(requirement?.mentor_checklist)
			? requirement.mentor_checklist.map((v: unknown) => String(v))
			: [];
		if (requiredChecklist.length > 0) {
			const checklistRows = Array.isArray(checklist_results) ? checklist_results : [];
			const passedSet = new Set(
				checklistRows
					.filter((row: any) => row?.passed)
					.map((row: any) => String(row?.item ?? ''))
			);
			const missing = requiredChecklist.filter((item) => !passedSet.has(item));
			if (missing.length > 0) {
				return json(
					{
						error: `Cannot approve until all mentor checklist items pass. Remaining: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`
					},
					{ status: 400 }
				);
			}
		}
	}

	if (profile.role === 'mentor' && user) {
		const [{ data: node }, { data: prefs }] = await Promise.all([
			locals.supabase.from('nodes').select('subteam_id').eq('id', nodeId).maybeSingle(),
			locals.supabase
				.from('mentor_subteam_preferences')
				.select('subteam_id')
				.eq('mentor_id', user.id)
		]);
		const prefIds = (prefs ?? []).map((row: { subteam_id: string }) => row.subteam_id);
		if (prefIds.length > 0 && node?.subteam_id && !prefIds.includes(node.subteam_id)) {
			return json({ error: 'This checkoff is outside your selected mentor teams.' }, { status: 403 });
		}
	}

	if (normalizedAction === 'approve' || normalizedAction === 'reset_quiz') {
		const status = normalizedAction === 'approve' ? 'completed' : 'quiz_pending';
		const { error } = await locals.supabase.rpc('transition_certification', {
			p_node_id: nodeId,
			p_new_status: status,
			p_target_user_id: userId,
			p_mentor_notes: notes ?? null
		});
		if (error) return json({ error: error.message }, { status: 400 });
	}

	if (normalizedAction === 'retry_checkoff') {
		await locals.supabase.from('checkoff_reviews').upsert(
			{
				user_id: userId,
				node_id: nodeId,
				reviewer_id: user.id,
				status: 'needs_review',
				mentor_notes: String(notes ?? ''),
				checklist_results: Array.isArray(checklist_results) ? checklist_results : []
			},
			{ onConflict: 'user_id,node_id' }
		);
		return json({ ok: true, status: 'needs_review' });
	}

	await locals.supabase.from('checkoff_reviews').upsert(
		{
			user_id: userId,
			node_id: nodeId,
			reviewer_id: user.id,
			status:
				normalizedAction === 'approve'
					? 'approved'
					: normalizedAction === 'block_checkoff'
						? 'blocked'
						: 'needs_review',
			mentor_notes: String(notes ?? ''),
			checklist_results: Array.isArray(checklist_results) ? checklist_results : []
		},
		{ onConflict: 'user_id,node_id' }
	);

	return json({ ok: true });
};
