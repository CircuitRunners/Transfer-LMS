import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isMentor } from '$lib/roles';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile) throw redirect(303, '/login');

	const { data: subteams } = await locals.supabase.from('subteams').select('id,name,slug').order('name');

	let mentorTeamIds: string[] = [];
	if (isMentor(profile)) {
		const { data: prefs } = await locals.supabase
			.from('mentor_subteam_preferences')
			.select('subteam_id')
			.eq('mentor_id', user.id);
		mentorTeamIds = (prefs ?? []).map((row: { subteam_id: string }) => row.subteam_id);
	}

	return { profile, subteams: subteams ?? [], mentorTeamIds };
};

export const actions: Actions = {
	setPrimaryTeam: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const form = await request.formData();
		const subteamId = String(form.get('subteam_id') ?? '').trim();

		const { error } = await locals.supabase
			.from('profiles')
			.update({ subteam_id: subteamId || null })
			.eq('id', user.id);
		if (error) return fail(400, { error: error.message, section: 'primary' });
		return { ok: true, section: 'primary' };
	},

	saveMentorTeams: async ({ locals, request }) => {
		const { user, profile } = await locals.safeGetSession();
		if (!user || !profile || !isMentor(profile)) {
			return fail(403, { error: 'Forbidden' });
		}

		const form = await request.formData();
		const ids = form
			.getAll('mentor_team_ids')
			.map((v) => String(v))
			.filter(Boolean);

		const { error: delError } = await locals.supabase
			.from('mentor_subteam_preferences')
			.delete()
			.eq('mentor_id', user.id);
		if (delError) return fail(400, { error: delError.message, section: 'mentor' });

		if (ids.length > 0) {
			const rows = ids.map((subteamId) => ({ mentor_id: user.id, subteam_id: subteamId }));
			const { error: insertError } = await locals.supabase
				.from('mentor_subteam_preferences')
				.insert(rows);
			if (insertError) return fail(400, { error: insertError.message, section: 'mentor' });
		}

		return { ok: true, section: 'mentor' };
	}
};
