import { json, type RequestHandler } from '@sveltejs/kit';
import { jwtVerify } from 'jose';

const encoder = new TextEncoder();

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile || !['mentor', 'admin'].includes(profile.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const {
		nodeId,
		userId,
		blockId,
		action,
		notes,
		checklist_results,
		qrToken,
		checkoffToken
	} = await request.json();
	const normalizedAction = action === 'review' ? 'reset_quiz' : action;
	let resolvedNodeId = String(nodeId ?? '');
	let resolvedUserId = String(userId ?? '');
	let resolvedBlockId = blockId ? String(blockId) : null;

	if (checkoffToken) {
		try {
			const { payload } = await jwtVerify(
				String(checkoffToken),
				encoder.encode(process.env.PASSPORT_QR_SECRET ?? 'dev-secret-change-me')
			);
			if (String(payload.kind ?? '') !== 'checkoff_approve') {
				return json({ error: 'Invalid checkoff QR token.' }, { status: 400 });
			}
			resolvedNodeId = String(payload.node_id ?? '');
			resolvedUserId = String(payload.user_id ?? '');
			resolvedBlockId = payload.block_id ? String(payload.block_id) : null;
		} catch {
			return json({ error: 'Invalid or expired checkoff QR token.' }, { status: 400 });
		}
	}

	const upsertReview = async (status: 'approved' | 'needs_review' | 'blocked') => {
		const payload = {
			user_id: resolvedUserId,
			node_id: resolvedNodeId,
			block_id: resolvedBlockId,
			reviewer_id: user.id,
			status,
			mentor_notes: String(notes ?? ''),
			checklist_results: Array.isArray(checklist_results) ? checklist_results : []
		};
		const updateQuery = locals.supabase
			.from('checkoff_reviews')
			.update(payload)
			.eq('user_id', resolvedUserId)
			.eq('node_id', resolvedNodeId);
		const { data: updatedRows, error: updateErr } = resolvedBlockId
			? await updateQuery.eq('block_id', resolvedBlockId).select('id').limit(1)
			: await updateQuery.is('block_id', null).select('id').limit(1);
		if (updateErr) return updateErr;
		if (!updatedRows || updatedRows.length === 0) {
			const { error: insertErr } = await locals.supabase.from('checkoff_reviews').insert(payload);
			if (insertErr) return insertErr;
		}
		return null;
	};
	if (
		!resolvedNodeId ||
		!resolvedUserId ||
		!['approve', 'reset_quiz', 'retry_checkoff', 'block_checkoff'].includes(normalizedAction)
	) {
		return json({ error: 'Invalid request payload' }, { status: 400 });
	}

	if (normalizedAction === 'approve') {
		const submissionQuery = locals.supabase
			.from('checkoff_submissions')
			.select('photo_data_url,photo_data_urls')
			.eq('node_id', resolvedNodeId)
			.eq('user_id', resolvedUserId);
		const [{ data: requirement }, { data: submission }] = await Promise.all([
			locals.supabase
				.from('node_checkoff_requirements')
				.select('evidence_mode,mentor_checklist')
				.eq('node_id', resolvedNodeId)
				.maybeSingle(),
			(resolvedBlockId
				? submissionQuery.eq('block_id', resolvedBlockId)
				: submissionQuery.is('block_id', null)
			).maybeSingle()
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
		if (!qrToken && !checkoffToken) {
			return json({ error: 'Mentor must scan student passport QR before checkoff actions.' }, { status: 400 });
		}
		if (!checkoffToken) {
			try {
				const { payload } = await jwtVerify(
					String(qrToken),
					encoder.encode(process.env.PASSPORT_QR_SECRET ?? 'dev-secret-change-me')
				);
				if (String(payload.user_id ?? '') !== String(resolvedUserId)) {
					return json({ error: 'Scanned passport does not match selected student.' }, { status: 400 });
				}
			} catch {
				return json({ error: 'Invalid or expired QR token. Rescan student passport.' }, { status: 400 });
			}
		}

		const [{ data: node }, { data: prefs }] = await Promise.all([
			locals.supabase.from('nodes').select('subteam_id').eq('id', resolvedNodeId).maybeSingle(),
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

	if (normalizedAction === 'reset_quiz') {
		const { error } = await locals.supabase.rpc('transition_certification', {
			p_node_id: resolvedNodeId,
			p_new_status: 'quiz_pending',
			p_target_user_id: resolvedUserId,
			p_mentor_notes: notes ?? null
		});
		if (error) return json({ error: error.message }, { status: 400 });
	}

	if (normalizedAction === 'approve') {
		const { data: checkoffBlock } = await locals.supabase
			.from('node_blocks')
			.select('id')
			.eq('id', resolvedBlockId ?? '')
			.eq('node_id', resolvedNodeId)
			.eq('type', 'checkoff')
			.maybeSingle();

		if (checkoffBlock?.id) {
			const { error: progressErr } = await locals.supabase.from('user_node_block_progress').upsert(
				{
					user_id: userId,
					user_id: resolvedUserId,
					node_id: resolvedNodeId,
					block_id: checkoffBlock.id,
					completed_at: new Date().toISOString()
				},
				{ onConflict: 'user_id,block_id' }
			);
			if (progressErr) return json({ error: progressErr.message }, { status: 400 });
		}

		const reviewErr = await upsertReview('approved');
		if (reviewErr) return json({ error: reviewErr.message }, { status: 400 });

		if (checkoffBlock?.id) {
			const { data: autoCert, error: autoErr } = await locals.supabase.rpc('try_auto_complete_node', {
				p_node_id: nodeId,
				p_node_id: resolvedNodeId,
				p_target_user_id: resolvedUserId
			});
			if (autoErr) return json({ error: autoErr.message }, { status: 400 });
			// Keep progress moving for partially-finished block courses,
			// but do not overwrite a freshly completed certification.
			if (autoCert?.status !== 'completed') {
				await locals.supabase.rpc('transition_certification', {
					p_node_id: resolvedNodeId,
					p_new_status: 'quiz_pending',
					p_target_user_id: resolvedUserId
				});
			}
		} else {
			const { error } = await locals.supabase.rpc('transition_certification', {
				p_node_id: resolvedNodeId,
				p_new_status: 'completed',
				p_target_user_id: resolvedUserId,
				p_mentor_notes: notes ?? null
			});
			if (error) return json({ error: error.message }, { status: 400 });
		}
		return json({ ok: true, nodeId: resolvedNodeId, userId: resolvedUserId });
	}

	if (normalizedAction === 'retry_checkoff') {
		const reviewErr = await upsertReview('needs_review');
		if (reviewErr) return json({ error: reviewErr.message }, { status: 400 });
		return json({ ok: true, status: 'needs_review' });
	}

	const reviewErr = await upsertReview(
		normalizedAction === 'block_checkoff' ? 'blocked' : 'needs_review'
	);
	if (reviewErr) return json({ error: reviewErr.message }, { status: 400 });

	return json({ ok: true });
};
