import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile || !['mentor', 'admin'].includes(profile.role)) throw redirect(303, '/dashboard');

	const [{ data: machines }, { data: activeSessions }, { data: recentSessions }] = await Promise.all([
		locals.supabase.from('machines').select('id,name,location,required_node_ids').order('name'),
		locals.supabase
			.from('machine_checkout_sessions')
			.select('id,machine_id,student_id,mentor_id,started_at,notes')
			.is('ended_at', null)
			.order('started_at', { ascending: false }),
		locals.supabase
			.from('machine_checkout_sessions')
			.select('id,machine_id,student_id,mentor_id,started_at,ended_at,notes')
			.not('ended_at', 'is', null)
			.order('ended_at', { ascending: false })
			.limit(80)
	]);

	const machineMap = new Map((machines ?? []).map((m: any) => [m.id, m]));
	const profileIds = Array.from(
		new Set([
			...(activeSessions ?? []).map((s: any) => s.student_id),
			...(activeSessions ?? []).map((s: any) => s.mentor_id),
			...(recentSessions ?? []).map((s: any) => s.student_id),
			...(recentSessions ?? []).map((s: any) => s.mentor_id)
		])
	);
	const { data: profiles } = profileIds.length
		? await locals.supabase.from('profiles').select('id,full_name,email').in('id', profileIds)
		: { data: [] as any[] };
	const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
	const decorate = (sessions: any[]) =>
		sessions.map((s: any) => ({
			...s,
			machine: machineMap.get(s.machine_id) ?? null,
			student: profileMap.get(s.student_id) ?? null,
			mentor: profileMap.get(s.mentor_id) ?? null
		}));

	return {
		machines: machines ?? [],
		activeSessions: decorate(activeSessions ?? []),
		recentSessions: decorate(recentSessions ?? [])
	};
};
