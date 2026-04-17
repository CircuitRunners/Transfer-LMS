import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [{ data: profiles }, { data: certs }, { data: quizAttempts }, { data: submissions }, { data: assessments }] =
		await Promise.all([
			locals.supabase.from('profiles').select('id,full_name,email,role,subteam_id'),
			locals.supabase
				.from('certifications')
				.select('user_id,status,node_id,quiz_score,quiz_passed_at,approved_at,nodes!inner(title,slug)')
				.not('status', 'eq', 'locked'),
			locals.supabase
				.from('quiz_attempts')
				.select('user_id,node_id,score,passed,answers,created_at,nodes!inner(title,slug)')
				.order('created_at', { ascending: false }),
			locals.supabase
				.from('checkoff_submissions')
				.select('user_id,node_id,notes,photo_data_url,photo_data_urls,updated_at'),
			locals.supabase.from('assessments').select('node_id,questions')
		]);

	const byUser = new Map<string, { completed: number; pending: number }>();
	const bottlenecks = new Map<string, number>();
	for (const cert of certs ?? []) {
		const agg = byUser.get(cert.user_id) ?? { completed: 0, pending: 0 };
		if (cert.status === 'completed') agg.completed += 1;
		if (cert.status === 'mentor_checkoff_pending') {
			agg.pending += 1;
			const title = (cert as any).nodes?.title ?? 'Unknown module';
			bottlenecks.set(title, (bottlenecks.get(title) ?? 0) + 1);
		}
		byUser.set(cert.user_id, agg);
	}

	const submissionsByKey = new Map(
		(submissions ?? []).map((s: any) => [`${s.user_id}:${s.node_id}`, s])
	);
	const attemptsByUserNode = new Map<string, any[]>();
	for (const attempt of quizAttempts ?? []) {
		const key = `${attempt.user_id}:${attempt.node_id}`;
		const list = attemptsByUserNode.get(key) ?? [];
		list.push(attempt);
		attemptsByUserNode.set(key, list);
	}
	const questionLabelByNode = new Map<string, Map<string, string>>();
	for (const assessment of assessments ?? []) {
		const perNode = new Map<string, string>();
		const questions = Array.isArray((assessment as any).questions) ? (assessment as any).questions : [];
		for (const q of questions) {
			const id = String((q as any)?.id ?? '');
			if (!id) continue;
			perNode.set(id, String((q as any)?.prompt ?? id));
		}
		questionLabelByNode.set((assessment as any).node_id, perNode);
	}

	const rows = (profiles ?? []).map((profile) => {
		const agg = byUser.get(profile.id) ?? { completed: 0, pending: 0 };
		const total = Math.max(agg.completed + agg.pending, 1);
		const userCourses = (certs ?? [])
			.filter((c: any) => c.user_id === profile.id)
			.map((c: any) => {
				const key = `${profile.id}:${c.node_id}`;
				const attempts = (attemptsByUserNode.get(key) ?? []).map((attempt: any) => {
					const rawAnswers = attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {};
					const labels = questionLabelByNode.get(c.node_id) ?? new Map<string, string>();
					const formattedAnswers = Object.entries(rawAnswers).map(([questionId, answer]) => {
						const label = labels.get(questionId) ?? questionId;
						const answerText = Array.isArray(answer)
							? answer.map((item) => String(item)).join(', ')
							: typeof answer === 'object' && answer !== null
								? JSON.stringify(answer)
								: String(answer ?? '');
						return { questionId, label, answerText };
					});
					return { ...attempt, formattedAnswers };
				});
				return {
					node_id: c.node_id,
					title: c.nodes?.title,
					slug: c.nodes?.slug,
					status: c.status,
					quiz_score: c.quiz_score,
					quiz_passed_at: c.quiz_passed_at,
					approved_at: c.approved_at,
					submission: submissionsByKey.get(key) ?? null,
					quizAttempts: attempts
				};
			})
			.sort((a: any, b: any) => {
				const aTs = a.approved_at || a.quiz_passed_at || '';
				const bTs = b.approved_at || b.quiz_passed_at || '';
				return String(bTs).localeCompare(String(aTs));
			});
		return {
			...profile,
			progressPercent: Math.round((agg.completed / total) * 100),
			pendingCheckoffs: agg.pending,
			courses: userCourses
		};
	});

	return {
		rows,
		bottlenecks: Array.from(bottlenecks.entries()).map(([node, count]) => ({ node, count }))
	};
};
