import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, profile } = await locals.safeGetSession();
	const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'mine';
	const selectedTeamId = url.searchParams.get('team') ?? '';

	const [{ data: certRows, error: certError }, { data: subteams }] = await Promise.all([
		locals.supabase
			.from('certifications')
			.select('id,user_id,node_id,status')
			.eq('status', 'mentor_checkoff_pending'),
		locals.supabase.from('subteams').select('id,name,slug').order('name')
	]);
	if (certError) {
		return {
			queue: [],
			subteams: subteams ?? [],
			mentorTeamIds: [],
			scope,
			selectedTeamId,
			error: certError.message
		};
	}

	let mentorTeamIds: string[] = [];
	if (user && profile && ['mentor', 'admin'].includes(profile.role)) {
		const { data: prefs } = await locals.supabase
			.from('mentor_subteam_preferences')
			.select('subteam_id')
			.eq('mentor_id', user.id);
		mentorTeamIds = (prefs ?? []).map((row: { subteam_id: string }) => row.subteam_id);
	}

	const baseQueue = certRows ?? [];

	const nodeIds = Array.from(new Set(baseQueue.map((item: any) => item.node_id)));
	const userIds = Array.from(new Set(baseQueue.map((item: any) => item.user_id)));
	const [reqResp, submissionResp, reviewsResp, nodesResp, profilesResp] = await Promise.all([
		nodeIds.length
			? locals.supabase
					.from('node_checkoff_requirements')
					.select('node_id,title,directions,mentor_checklist,resource_links,evidence_mode')
					.in('node_id', nodeIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length && userIds.length
			? locals.supabase
					.from('checkoff_submissions')
					.select('user_id,node_id,notes,photo_data_url,photo_data_urls,updated_at')
					.in('node_id', nodeIds)
					.in('user_id', userIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length && userIds.length
			? locals.supabase
					.from('checkoff_reviews')
					.select('user_id,node_id,status,mentor_notes,checklist_results,reviewer_id,updated_at')
					.in('node_id', nodeIds)
					.in('user_id', userIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length
			? locals.supabase.from('nodes').select('id,title,slug,subteam_id').in('id', nodeIds)
			: Promise.resolve({ data: [] as any[] }),
		userIds.length
			? locals.supabase.from('profiles').select('id,email,full_name,subteam_id').in('id', userIds)
			: Promise.resolve({ data: [] as any[] })
	]);

	const subteamMap = new Map((subteams ?? []).map((s: any) => [s.id, s]));
	const requirementByNode = new Map((reqResp.data ?? []).map((r: any) => [r.node_id, r]));
	const submissionByPair = new Map(
		(submissionResp.data ?? []).map((s: any) => [`${s.user_id}:${s.node_id}`, s])
	);
	const reviewByPair = new Map((reviewsResp.data ?? []).map((r: any) => [`${r.user_id}:${r.node_id}`, r]));
	const nodeById = new Map((nodesResp.data ?? []).map((n: any) => [n.id, n]));
	const profileById = new Map((profilesResp.data ?? []).map((p: any) => [p.id, p]));

	let queue = baseQueue.map((item: any) => ({
		id: item.id,
		user_id: item.user_id,
		node_id: item.node_id,
		status: item.status,
		profile: (() => {
			const p = profileById.get(item.user_id);
			return {
				...p,
				subteam: p?.subteam_id ? subteamMap.get(p.subteam_id) ?? null : null
			};
		})(),
		node: (() => {
			const n = nodeById.get(item.node_id);
			return {
				...n,
				subteam: n?.subteam_id ? subteamMap.get(n.subteam_id) ?? null : null
			};
		})(),
		requirement: requirementByNode.get(item.node_id) ?? null,
		submission: submissionByPair.get(`${item.user_id}:${item.node_id}`) ?? null,
		review: reviewByPair.get(`${item.user_id}:${item.node_id}`) ?? null
	}));
	queue = queue.map((item: any) => {
		const derivedCheckoffStatus = item.review?.status
			? item.review.status
			: item.submission
				? 'submitted'
				: 'not_submitted';
		return { ...item, derivedCheckoffStatus };
	});

	const shouldFilterMine = scope === 'mine' && mentorTeamIds.length > 0;
	if (shouldFilterMine) {
		queue = queue.filter((item: any) => mentorTeamIds.includes(item.node?.subteam_id));
	}
	if (selectedTeamId) {
		queue = queue.filter((item: any) => item.node?.subteam_id === selectedTeamId);
	}

	return { queue, subteams: subteams ?? [], mentorTeamIds, scope, selectedTeamId, error: null };
};
