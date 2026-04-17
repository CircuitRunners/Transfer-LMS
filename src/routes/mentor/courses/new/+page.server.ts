import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { data: subteams } = await locals.supabase
		.from('subteams')
		.select('id,name')
		.order('name');
	return { subteams: subteams ?? [] };
};

const slugify = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const rawSlug = String(form.get('slug') ?? '').trim();
		const slug = rawSlug ? slugify(rawSlug) : slugify(title);
		const subteamId = String(form.get('subteam_id') ?? '');
		const videoUrl = String(form.get('video_url') ?? '').trim();
		const description = String(form.get('description') ?? '');

		if (!title || !slug || !subteamId) {
			return fail(400, {
				error: 'Title, slug, and subteam are required.',
				values: { title, slug, subteamId, videoUrl, description }
			});
		}

		const { data: node, error } = await locals.supabase
			.from('nodes')
			.insert({
				title,
				slug,
				subteam_id: subteamId,
				video_url: videoUrl,
				description
			})
			.select('id')
			.single();

		if (error) {
			return fail(400, {
				error: error.message,
				values: { title, slug, subteamId, videoUrl, description }
			});
		}
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

		throw redirect(303, `/mentor/courses/${slug}`);
	}
};
