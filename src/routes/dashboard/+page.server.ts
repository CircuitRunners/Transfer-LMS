import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/login');

	const [
		nodesResp,
		statusesResp,
		subteamsResp,
		prereqResp,
		reviewResp,
		blockRowsResp,
		assessmentRowsResp,
		checkoffRowsResp,
		blockProgressResp
	] = await Promise.all([
		locals.supabase
			.from('nodes')
			.select('id,title,slug,subteam_id,video_url')
			.order('title', { ascending: true }),
		locals.supabase
			.from('v_user_node_status')
			.select('node_id,computed_status')
			.eq('user_id', user.id),
		locals.supabase.from('subteams').select('id,name,slug').order('name'),
		locals.supabase.from('node_prerequisites').select('node_id,prerequisite_node_id'),
		locals.supabase
			.from('checkoff_reviews')
			.select('node_id,status,updated_at')
			.eq('user_id', user.id)
			.in('status', ['needs_review', 'blocked']),
		locals.supabase.from('node_blocks').select('node_id,id'),
		locals.supabase.from('assessments').select('node_id'),
		locals.supabase.from('node_checkoff_requirements').select('node_id'),
		locals.supabase
			.from('user_node_block_progress')
			.select('node_id,block_id,completed_at')
			.eq('user_id', user.id)
	]);

	return {
		profile,
		nodes: nodesResp.data ?? [],
		statuses: statusesResp.data ?? [],
		subteams: subteamsResp.data ?? [],
		prerequisites: prereqResp.data ?? [],
		checkoffReviews: reviewResp.data ?? [],
		blockRows: blockRowsResp.data ?? [],
		assessmentRows: assessmentRowsResp.data ?? [],
		checkoffRows: checkoffRowsResp.data ?? [],
		blockProgress: blockProgressResp.data ?? []
	};
};
