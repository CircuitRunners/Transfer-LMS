import { redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile || !['mentor', 'admin'].includes(profile.role)) throw redirect(303, '/dashboard');

	const [{ data: machines }, { data: courses }, { data: usageEvents }] = await Promise.all([
		locals.supabase
			.from('machines')
			.select('id,name,description,location,required_node_ids,qr_token,created_at')
			.order('name'),
		locals.supabase.from('nodes').select('id,title,slug').order('title'),
		locals.supabase
			.from('machine_usage_events')
			.select('id,machine_id,user_id,authorized,details,created_at')
			.order('created_at', { ascending: false })
			.limit(120)
	]);
	const host = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
	const qrByToken = new Map<string, string>();
	for (const machine of machines ?? []) {
		const token = String((machine as any).qr_token ?? '');
		if (!token) continue;
		const url = `${host}/scan?machine=${encodeURIComponent(token)}`;
		qrByToken.set(token, await QRCode.toDataURL(url));
	}

	const profileIds = Array.from(new Set((usageEvents ?? []).map((s: any) => s.user_id)));
	const { data: profiles } = profileIds.length
		? await locals.supabase.from('profiles').select('id,full_name,email').in('id', profileIds)
		: { data: [] as any[] };
	const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

	const machineMap = new Map((machines ?? []).map((m: any) => [m.id, m]));
	const decoratedEvents = (usageEvents ?? []).map((evt: any) => ({
		...evt,
		user: profileMap.get(evt.user_id) ?? null,
		machine: machineMap.get(evt.machine_id) ?? null
	}));

	return {
		machines:
			(machines ?? []).map((m: any) => ({
				...m,
				qrDataUrl: qrByToken.get(String(m.qr_token ?? '')) ?? ''
			})) ?? [],
		courses: courses ?? [],
		usageEvents: decoratedEvents
	};
};
