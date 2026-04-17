import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { data: subteams } = await locals.supabase.from('subteams').select('id,name').order('name');
	const { data: nodes } = await locals.supabase
		.from('nodes')
		.select('id,title,slug,subteam_id')
		.order('title');
	return { subteams: subteams ?? [], nodes: nodes ?? [] };
};

export const actions: Actions = {
	createNode: async ({ locals, request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		const slug = String(form.get('slug') ?? '');
		const videoUrl = String(form.get('video_url') ?? '');
		const subteamId = String(form.get('subteam_id') ?? '');
		const { data: node } = await locals.supabase
			.from('nodes')
			.insert({
				title,
				slug,
				video_url: videoUrl,
				subteam_id: subteamId,
				description: String(form.get('description') ?? '')
			})
			.select('id')
			.single();
		if (node?.id) {
			await locals.supabase.from('node_checkoff_requirements').upsert(
				{
					node_id: node.id,
					title: 'Physical checkoff',
					directions: '',
					mentor_checklist: [],
					resource_links: [],
					evidence_mode: 'none'
				},
				{ onConflict: 'node_id' }
			);
		}
		return { ok: true };
	}
};
