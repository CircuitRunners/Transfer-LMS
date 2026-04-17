import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isAdmin, isLead, isMentor } from '$lib/roles';

const DAYS = 14;

function dateOnly(d: Date) {
	return d.toISOString().slice(0, 10);
}

function buildWindow() {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const dates: string[] = [];
	for (let i = 0; i < DAYS; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		dates.push(dateOnly(d));
	}
	return { start: dates[0], end: dates[dates.length - 1], dates };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile) throw redirect(303, '/login');

	const scope = (url.searchParams.get('scope') ?? 'me') as 'me' | 'team' | 'all';
	const canTeam = isMentor(profile) || isLead(profile);
	const canAll = isAdmin(profile);

	const { start, end, dates } = buildWindow();

	// Fetch subteams for labelling
	const { data: subteams } = await locals.supabase.from('subteams').select('id,name,slug').order('name');

	// Self availability
	const { data: mine } = await locals.supabase
		.from('shop_shift_availability')
		.select('shift_date,shift_number')
		.eq('user_id', user.id)
		.gte('shift_date', start)
		.lte('shift_date', end);

	const mineSet = new Set((mine ?? []).map((r) => `${r.shift_date}|${r.shift_number}`));

	// Determine roster scope
	type RosterUser = {
		id: string;
		full_name: string;
		email: string;
		avatar_url: string;
		role: string;
		base_role: string | null;
		is_mentor: boolean | null;
		is_lead: boolean | null;
		subteam_id: string | null;
	};
	const rosterRank = (r: RosterUser) => {
		if (isMentor(r)) return 0;
		if (isAdmin(r)) return 1;
		if (isLead(r)) return 2;
		return 3;
	};
	const rosterSort = (a: RosterUser, b: RosterUser) => {
		const rankDelta = rosterRank(a) - rosterRank(b);
		if (rankDelta !== 0) return rankDelta;
		return (a.full_name || a.email).localeCompare(b.full_name || b.email);
	};
	let roster: RosterUser[] = [];
	if (scope === 'team' && canTeam && profile.subteam_id) {
		const { data } = await locals.supabase
			.from('profiles')
			.select('id,full_name,email,avatar_url,role,base_role,is_mentor,is_lead,subteam_id')
			.eq('subteam_id', profile.subteam_id)
			.order('full_name');
		roster = (data ?? []).sort(rosterSort);
	} else if (scope === 'all' && canAll) {
		const { data } = await locals.supabase
			.from('profiles')
			.select('id,full_name,email,avatar_url,role,base_role,is_mentor,is_lead,subteam_id')
			.order('full_name');
		roster = (data ?? []).sort(rosterSort);
	}

	let rosterAvailability: Array<{ user_id: string; shift_date: string; shift_number: number }> = [];
	if (roster.length > 0) {
		const { data } = await locals.supabase
			.from('shop_shift_availability')
			.select('user_id,shift_date,shift_number')
			.in('user_id', roster.map((r) => r.id))
			.gte('shift_date', start)
			.lte('shift_date', end);
		rosterAvailability = data ?? [];
	}

	// Group by date+shift for display
	const bucket = new Map<string, string[]>(); // key `date|shift` -> [user_id]
	for (const r of rosterAvailability) {
		const key = `${r.shift_date}|${r.shift_number}`;
		const list = bucket.get(key) ?? [];
		list.push(r.user_id);
		bucket.set(key, list);
	}
	const rosterByKey: Record<string, string[]> = {};
	const rosterOrder = new Map(roster.map((r, idx) => [r.id, idx]));
	bucket.forEach((v, k) =>
		(rosterByKey[k] = v.slice().sort((a, b) => (rosterOrder.get(a) ?? 9999) - (rosterOrder.get(b) ?? 9999)))
	);

	return {
		scope,
		canTeam,
		canAll,
		dates,
		mine: Array.from(mineSet),
		roster,
		rosterByKey,
		subteams: subteams ?? []
	};
};

export const actions: Actions = {
	toggle: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const form = await request.formData();
		const date = String(form.get('date') ?? '');
		const shift = Number(form.get('shift') ?? '0');
		const available = String(form.get('available') ?? '') === 'true';
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![1, 2].includes(shift)) {
			return fail(400, { error: 'Bad date or shift.' });
		}

		if (available) {
			const { error } = await locals.supabase
				.from('shop_shift_availability')
				.upsert(
					{ user_id: user.id, shift_date: date, shift_number: shift },
					{ onConflict: 'user_id,shift_date,shift_number' }
				);
			if (error) return fail(400, { error: error.message });
		} else {
			const { error } = await locals.supabase
				.from('shop_shift_availability')
				.delete()
				.eq('user_id', user.id)
				.eq('shift_date', date)
				.eq('shift_number', shift);
			if (error) return fail(400, { error: error.message });
		}
		return { ok: true };
	}
};
