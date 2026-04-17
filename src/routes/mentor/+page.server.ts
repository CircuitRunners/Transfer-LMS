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
	const [{ data: historyCertRows }, { data: reviewHistoryRows }] = await Promise.all([
		locals.supabase
			.from('certifications')
			.select('user_id,node_id,approved_at,approved_by,status')
			.eq('status', 'completed')
			.order('approved_at', { ascending: false })
			.limit(120),
		locals.supabase
			.from('checkoff_reviews')
			.select('user_id,node_id,status,mentor_notes,updated_at,reviewer_id')
			.in('status', ['needs_review', 'blocked'])
			.order('updated_at', { ascending: false })
			.limit(120)
	]);

	const nodeIds = Array.from(new Set(baseQueue.map((item: any) => item.node_id)));
	const userIds = Array.from(new Set(baseQueue.map((item: any) => item.user_id)));
	const [reqResp, submissionResp, reviewsResp, nodesResp, profilesResp, checkoffBlocksResp] = await Promise.all([
		nodeIds.length
			? locals.supabase
					.from('node_checkoff_requirements')
					.select('node_id,title,directions,mentor_checklist,resource_links,evidence_mode')
					.in('node_id', nodeIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length && userIds.length
			? locals.supabase
					.from('checkoff_submissions')
					.select('user_id,node_id,block_id,notes,photo_data_url,photo_data_urls,updated_at')
					.in('node_id', nodeIds)
					.in('user_id', userIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length && userIds.length
			? locals.supabase
					.from('checkoff_reviews')
					.select('user_id,node_id,block_id,status,mentor_notes,checklist_results,reviewer_id,updated_at')
					.in('node_id', nodeIds)
					.in('user_id', userIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length
			? locals.supabase.from('nodes').select('id,title,slug,subteam_id').in('id', nodeIds)
			: Promise.resolve({ data: [] as any[] }),
		userIds.length
			? locals.supabase.from('profiles').select('id,email,full_name,subteam_id').in('id', userIds)
			: Promise.resolve({ data: [] as any[] }),
		nodeIds.length
			? locals.supabase
					.from('node_blocks')
					.select('id,node_id,position,type,config')
					.in('node_id', nodeIds)
					.eq('type', 'checkoff')
			: Promise.resolve({ data: [] as any[] })
	]);

	const subteamMap = new Map((subteams ?? []).map((s: any) => [s.id, s]));
	const requirementByNode = new Map((reqResp.data ?? []).map((r: any) => [r.node_id, r]));
	const submissionByPair = new Map<string, any>();
	for (const row of submissionResp.data ?? []) {
		const key = `${row.user_id}:${row.node_id}`;
		const prev = submissionByPair.get(key);
		if (!prev || new Date(row.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
			submissionByPair.set(key, row);
		}
	}
	const reviewByPair = new Map<string, any>();
	for (const row of reviewsResp.data ?? []) {
		const key = `${row.user_id}:${row.node_id}`;
		const prev = reviewByPair.get(key);
		if (!prev || new Date(row.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
			reviewByPair.set(key, row);
		}
	}
	const checkoffBlockById = new Map((checkoffBlocksResp.data ?? []).map((b: any) => [b.id, b]));
	const nodeById = new Map((nodesResp.data ?? []).map((n: any) => [n.id, n]));
	const profileById = new Map((profilesResp.data ?? []).map((p: any) => [p.id, p]));
	const historyNodeIds = Array.from(
		new Set([
			...(historyCertRows ?? []).map((row: any) => row.node_id),
			...(reviewHistoryRows ?? []).map((row: any) => row.node_id)
		])
	);
	const historyUserIds = Array.from(
		new Set([
			...(historyCertRows ?? []).map((row: any) => row.user_id),
			...(reviewHistoryRows ?? []).map((row: any) => row.user_id)
		])
	);
	const [historyNodesResp, historyProfilesResp] = await Promise.all([
		historyNodeIds.length
			? locals.supabase.from('nodes').select('id,title,slug,subteam_id').in('id', historyNodeIds)
			: Promise.resolve({ data: [] as any[] }),
		historyUserIds.length
			? locals.supabase.from('profiles').select('id,full_name,email,subteam_id').in('id', historyUserIds)
			: Promise.resolve({ data: [] as any[] })
	]);
	const historyNodeById = new Map((historyNodesResp.data ?? []).map((n: any) => [n.id, n]));
	const historyProfileById = new Map((historyProfilesResp.data ?? []).map((p: any) => [p.id, p]));

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
		submission: submissionByPair.get(`${item.user_id}:${item.node_id}`) ?? null,
		review: reviewByPair.get(`${item.user_id}:${item.node_id}`) ?? null
	}));
	queue = queue.map((item: any) => {
		const activeBlockId = item.submission?.block_id ?? item.review?.block_id ?? null;
		const block = activeBlockId ? checkoffBlockById.get(activeBlockId) : null;
		const blockConfig = block?.config ?? null;
		const fallback = requirementByNode.get(item.node_id) ?? null;
		return {
			...item,
			active_block_id: activeBlockId,
			requirement: blockConfig
				? {
						title: String(blockConfig.title ?? 'Checkoff'),
						directions: String(blockConfig.directions ?? ''),
						mentor_checklist: Array.isArray(blockConfig.mentor_checklist)
							? blockConfig.mentor_checklist
							: [],
						resource_links: Array.isArray(blockConfig.resource_links)
							? blockConfig.resource_links
							: [],
						evidence_mode: String(blockConfig.evidence_mode ?? 'none')
					}
				: fallback
		};
	});
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

	const history: any[] = [
		...(historyCertRows ?? []).map((row: any) => {
			const n = historyNodeById.get(row.node_id);
			const p = historyProfileById.get(row.user_id);
			return {
				kind: 'approved',
				updated_at: row.approved_at,
				mentor_notes: null,
				user: p,
				node: n
			};
		}),
		...(reviewHistoryRows ?? []).map((row: any) => {
			const n = historyNodeById.get(row.node_id);
			const p = historyProfileById.get(row.user_id);
			return {
				kind: row.status,
				updated_at: row.updated_at,
				mentor_notes: row.mentor_notes,
				user: p,
				node: n
			};
		})
	]
		.filter((row: any) => row.user && row.node && row.updated_at)
		.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
		.slice(0, 120);

	return { queue, history, subteams: subteams ?? [], mentorTeamIds, scope, selectedTeamId, error: null };
};
