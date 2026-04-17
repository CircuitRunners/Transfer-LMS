import { json, type RequestHandler } from '@sveltejs/kit';

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const formData = await request.formData();
	const nodeId = String(formData.get('nodeId') ?? '');
	const segmentId = String(formData.get('segmentId') ?? '').trim();
	const blockId = String(formData.get('blockId') ?? '').trim();
	if (!nodeId) return json({ error: 'nodeId required' }, { status: 400 });

	const [{ data: assessment }, { data: cert }, { data: segments }, { data: blocks }] =
		await Promise.all([
			locals.supabase
				.from('assessments')
				.select(
					'questions,passing_score,min_seconds_between_attempts,fail_window_minutes,max_failed_in_window,short_answer_min_chars,short_answer_max_chars'
				)
				.eq('node_id', nodeId)
				.maybeSingle(),
			locals.supabase
				.from('certifications')
				.select('status')
				.eq('node_id', nodeId)
				.eq('user_id', user.id)
				.maybeSingle(),
			locals.supabase
				.from('node_learning_segments')
				.select('id,position,questions,passing_score')
				.eq('node_id', nodeId)
				.order('position'),
			locals.supabase
				.from('node_blocks')
				.select('id,position,type,config')
				.eq('node_id', nodeId)
				.order('position')
		]);

	const segmentRows = segments ?? [];
	const blockRows = blocks ?? [];
	const hasSegments = segmentRows.length > 0 && !blockId;
	const hasBlocks = blockRows.length > 0;

	if (!assessment && !hasSegments && !blockId)
		return json({ error: 'Assessment missing' }, { status: 404 });
	if (!cert) return json({ error: 'Certification state missing for this module' }, { status: 400 });
	if (cert.status === 'completed')
		return json({ error: 'This module is already completed.' }, { status: 409 });

	let questions: any[] = assessment?.questions ?? [];
	let passingScore = Number(assessment?.passing_score ?? 80);
	let activeSegment: any = null;
	let activeBlock: any = null;

	if (hasBlocks && blockId) {
		activeBlock = blockRows.find((b: any) => b.id === blockId);
		if (!activeBlock) return json({ error: 'Invalid block for this module.' }, { status: 400 });
		if (activeBlock.type !== 'quiz')
			return json({ error: 'This block is not a quiz block.' }, { status: 400 });

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

		const { data: currentProgress } = await locals.supabase
			.from('user_node_block_progress')
			.select('completed_at')
			.eq('user_id', user.id)
			.eq('block_id', blockId)
			.maybeSingle();
		if (currentProgress?.completed_at) {
			return json({ error: 'This quiz block is already passed.' }, { status: 409 });
		}

		const cfg = activeBlock.config ?? {};
		questions = Array.isArray(cfg.questions) ? cfg.questions : [];
		passingScore = Number(cfg.passing_score ?? 80);
	} else if (hasSegments) {
		if (cert.status !== 'quiz_pending' && cert.status !== 'video_pending') {
			return json({ error: 'Quiz is not unlocked yet.' }, { status: 400 });
		}
		if (!segmentId)
			return json({ error: 'segmentId required for segmented modules' }, { status: 400 });
		activeSegment = segmentRows.find((s: any) => s.id === segmentId);
		if (!activeSegment) return json({ error: 'Invalid segment for this module' }, { status: 400 });
		questions = Array.isArray(activeSegment.questions) ? activeSegment.questions : [];
		passingScore = Number(activeSegment.passing_score ?? 80);

		const priorIds = segmentRows
			.filter((s: any) => Number(s.position) < Number(activeSegment.position))
			.map((s: any) => s.id);
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
				return json({ error: 'Previous segment quiz is not passed yet.' }, { status: 400 });
			}
		}

		const { data: currentProgress } = await locals.supabase
			.from('user_node_segment_progress')
			.select('watched_at,passed_at')
			.eq('user_id', user.id)
			.eq('segment_id', segmentId)
			.maybeSingle();
		if (!currentProgress?.watched_at) {
			return json({ error: 'Watch the current segment before taking its quiz.' }, { status: 400 });
		}
		if (currentProgress?.passed_at) {
			return json({ error: 'This segment quiz is already passed.' }, { status: 409 });
		}
	} else {
		if (cert.status === 'mentor_checkoff_pending')
			return json({ error: 'Quiz already passed. Awaiting mentor checkoff.' }, { status: 409 });
		if (cert.status !== 'quiz_pending') {
			return json({ error: 'Quiz is not unlocked yet. Complete the video first.' }, { status: 400 });
		}
	}

	const minSecondsBetweenAttempts = clampInt(assessment?.min_seconds_between_attempts, 15, 0, 3600);
	const failWindowMinutes = clampInt(assessment?.fail_window_minutes, 10, 1, 1440);
	const maxFailedInWindow = clampInt(assessment?.max_failed_in_window, 5, 1, 200);
	const shortAnswerMinChars = clampInt(assessment?.short_answer_min_chars, 3, 0, 5000);
	const shortAnswerMaxChars = clampInt(assessment?.short_answer_max_chars, 300, 1, 5000);

	let recentAttemptsData: any[] | null = null;
	if (blockId) {
		const { data } = await locals.supabase
			.from('block_quiz_attempts')
			.select('created_at,passed')
			.eq('user_id', user.id)
			.eq('block_id', blockId)
			.order('created_at', { ascending: false })
			.limit(25);
		recentAttemptsData = data;
	} else if (segmentId) {
		const { data } = await locals.supabase
			.from('segment_quiz_attempts')
			.select('created_at,passed')
			.eq('user_id', user.id)
			.eq('segment_id', segmentId)
			.order('created_at', { ascending: false })
			.limit(25);
		recentAttemptsData = data;
	} else {
		const { data } = await locals.supabase
			.from('quiz_attempts')
			.select('created_at,passed')
			.eq('user_id', user.id)
			.eq('node_id', nodeId)
			.order('created_at', { ascending: false })
			.limit(25);
		recentAttemptsData = data;
	}

	const now = Date.now();
	const newest = recentAttemptsData?.[0];
	if (newest?.created_at) {
		const secondsSince = Math.floor((now - new Date(newest.created_at).getTime()) / 1000);
		if (secondsSince < minSecondsBetweenAttempts) {
			const waitSeconds = minSecondsBetweenAttempts - secondsSince;
			return json(
				{ error: `Please wait ${waitSeconds}s before trying again.` },
				{ status: 429, headers: { 'retry-after': String(waitSeconds) } }
			);
		}
	}
	const failWindowStart = now - failWindowMinutes * 60 * 1000;
	const failedInWindow =
		recentAttemptsData?.filter(
			(a) => !a.passed && new Date(a.created_at).getTime() >= failWindowStart
		).length ?? 0;
	if (failedInWindow >= maxFailedInWindow) {
		return json(
			{
				error: `Too many failed attempts. Please wait ${failWindowMinutes} minutes and review the module before retrying.`
			},
			{ status: 429, headers: { 'retry-after': String(failWindowMinutes * 60) } }
		);
	}

	const answers: Record<string, string> = {};
	let correct = 0;
	for (const question of questions) {
		const rawAnswer = String(formData.get(question.id) ?? '').trim();
		const answer = rawAnswer.toLowerCase();
		answers[question.id] = answer;

		if (question.type === 'mc') {
			const normalizedOptions = (question.options ?? [])
				.map((option: unknown) => String(option).trim().toLowerCase())
				.filter(Boolean);
			if (!normalizedOptions.includes(answer)) {
				return json({ error: 'Invalid multiple-choice answer submitted.' }, { status: 400 });
			}
		}
		if (question.type === 'tf' && !['true', 'false'].includes(answer)) {
			return json({ error: 'Invalid true/false answer submitted.' }, { status: 400 });
		}
		if (question.type === 'short') {
			if (rawAnswer.length < shortAnswerMinChars) {
				return json(
					{ error: `Short answers must be at least ${shortAnswerMinChars} characters.` },
					{ status: 400 }
				);
			}
			if (rawAnswer.length > shortAnswerMaxChars) {
				return json(
					{ error: `Short answers must be at most ${shortAnswerMaxChars} characters.` },
					{ status: 400 }
				);
			}
		}

		if (answer === String(question.correct ?? '').trim().toLowerCase()) correct += 1;
	}
	const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
	const passed = score >= passingScore;

	if (activeBlock) {
		await locals.supabase.from('block_quiz_attempts').insert({
			user_id: user.id,
			node_id: nodeId,
			block_id: activeBlock.id,
			answers,
			score,
			passed
		});
		if (passed) {
			await locals.supabase.from('user_node_block_progress').upsert(
				{
					user_id: user.id,
					node_id: nodeId,
					block_id: activeBlock.id,
					best_score: score,
					completed_at: new Date().toISOString()
				},
				{ onConflict: 'user_id,block_id' }
			);
			await locals.supabase.rpc('try_auto_complete_node', {
				p_node_id: nodeId,
				p_target_user_id: user.id
			});
		}
	} else if (hasSegments && activeSegment) {
		await locals.supabase.from('segment_quiz_attempts').insert({
			user_id: user.id,
			node_id: nodeId,
			segment_id: activeSegment.id,
			answers,
			score,
			passed
		});
		await locals.supabase.from('user_node_segment_progress').upsert(
			{
				user_id: user.id,
				node_id: nodeId,
				segment_id: activeSegment.id,
				best_score: score,
				passed_at: passed ? new Date().toISOString() : null
			},
			{ onConflict: 'user_id,segment_id' }
		);
		if (passed) {
			const lastSegment = segmentRows[segmentRows.length - 1];
			const isFinalSegment = lastSegment?.id === activeSegment.id;
			if (isFinalSegment) {
				await locals.supabase.rpc('transition_certification', {
					p_node_id: nodeId,
					p_new_status: 'mentor_checkoff_pending',
					p_target_user_id: user.id
				});
				await locals.supabase
					.from('certifications')
					.update({ quiz_passed_at: new Date().toISOString(), quiz_score: score })
					.eq('node_id', nodeId)
					.eq('user_id', user.id);
			} else {
				await locals.supabase.rpc('transition_certification', {
					p_node_id: nodeId,
					p_new_status: 'video_pending',
					p_target_user_id: user.id
				});
			}
		}
	} else {
		await locals.supabase.from('quiz_attempts').insert({
			user_id: user.id,
			node_id: nodeId,
			answers,
			score,
			passed
		});
		if (passed) {
			await locals.supabase.rpc('transition_certification', {
				p_node_id: nodeId,
				p_new_status: 'mentor_checkoff_pending',
				p_target_user_id: user.id
			});
			await locals.supabase
				.from('certifications')
				.update({ quiz_passed_at: new Date().toISOString(), quiz_score: score })
				.eq('node_id', nodeId)
				.eq('user_id', user.id);
		}
	}

	return json({ passed, score });
};
