import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isAdmin } from '$lib/roles';

const BASE_ALLOWED = new Set(['member', 'admin']);

const toLegacyRole = (baseRole: string, isMentor: boolean, isLead: boolean) => {
	if (baseRole === 'admin') return 'admin';
	if (isMentor) return 'mentor';
	if (isLead) return 'student_lead';
	return 'student';
};

export const load: PageServerLoad = async ({ locals }) => {
	const { profile } = await locals.safeGetSession();
	if (!profile || !isAdmin(profile)) throw redirect(303, '/dashboard');
	const { data: users } = await locals.supabase
		.from('profiles')
		.select('id,full_name,email,role,base_role,is_mentor,is_lead,subteam_id')
		.order('full_name');
	return { users: users ?? [] };
};

export const actions: Actions = {
	setRole: async ({ locals, request }) => {
		const { profile } = await locals.safeGetSession();
		if (!profile || !isAdmin(profile)) return fail(403, { error: 'Forbidden' });
		const form = await request.formData();
		const userId = String(form.get('user_id') ?? '');
		const baseRole = String(form.get('base_role') ?? '');
		const isMentor = String(form.get('is_mentor') ?? '') === 'on';
		const isLead = String(form.get('is_lead') ?? '') === 'on';
		if (!userId || !BASE_ALLOWED.has(baseRole)) return fail(400, { error: 'Invalid role update.' });
		const role = toLegacyRole(baseRole, isMentor, isLead);
		const { error } = await locals.supabase
			.from('profiles')
			.update({
				base_role: baseRole,
				is_mentor: isMentor,
				is_lead: isLead,
				role
			})
			.eq('id', userId);
		if (error) return fail(400, { error: error.message });
		return { ok: true };
	}
};
