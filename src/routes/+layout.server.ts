export const load = async ({ locals }) => {
	const { session, user, profile } = await locals.safeGetSession();
	const { data: org } = await locals.supabase.from('org_settings').select('name').eq('id', 1).maybeSingle();
	return {
		session,
		user,
		profile,
		orgName: org?.name ?? 'Workspace'
	};
};
