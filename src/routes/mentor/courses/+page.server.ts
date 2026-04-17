import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const subteamFilter = url.searchParams.get('subteam') ?? '';
	const q = url.searchParams.get('q') ?? '';

	const { data: subteams } = await locals.supabase
		.from('subteams')
		.select('id,name,slug')
		.order('name');

	let query = locals.supabase
		.from('nodes')
		.select('id,title,slug,subteam_id')
		.order('title', { ascending: true });

	if (subteamFilter) query = query.eq('subteam_id', subteamFilter);
	if (q) query = query.ilike('title', `%${q}%`);

	const { data: nodes } = await query;

	return {
		subteams: subteams ?? [],
		nodes: nodes ?? [],
		filter: { subteam: subteamFilter, q }
	};
};
