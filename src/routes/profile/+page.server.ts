import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import QRCode from 'qrcode';
import { SignJWT } from 'jose';
import { isMentor } from '$lib/roles';

const encoder = new TextEncoder();

export const load: PageServerLoad = async ({ locals }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user || !profile) throw redirect(303, '/login');

	const [
		{ data: subteams },
		mentorPrefsResult,
		{ data: completedRows },
		{ data: allSubteams }
	] = await Promise.all([
		locals.supabase.from('subteams').select('id,name,slug').order('name'),
		isMentor(profile)
			? locals.supabase
					.from('mentor_subteam_preferences')
					.select('subteam_id')
					.eq('mentor_id', user.id)
			: Promise.resolve({ data: [] as { subteam_id: string }[] }),
		locals.supabase
			.from('certifications')
			.select('node_id,nodes!inner(title,subteam_id)')
			.eq('user_id', user.id)
			.eq('status', 'completed'),
		locals.supabase.from('subteams').select('id,name')
	]);

	const mentorTeamIds = (mentorPrefsResult.data ?? []).map((row: { subteam_id: string }) => row.subteam_id);
	const completed = completedRows ?? [];
	const badges = completed.map((row: any) => row.nodes?.title).filter(Boolean);
	const progressSummary = `${completed.length} module${completed.length === 1 ? '' : 's'} completed`;
	const subteamNameById = new Map((allSubteams ?? []).map((s: any) => [String(s.id), String(s.name)]));
	const perTrack = new Map<string, number>();
	for (const row of completed) {
		const trackId = String(row?.nodes?.subteam_id ?? '');
		if (!trackId) continue;
		perTrack.set(trackId, (perTrack.get(trackId) ?? 0) + 1);
	}
	const trackRanks = Array.from(perTrack.entries())
		.map(([trackId, count]) => ({
			trackId,
			trackName: subteamNameById.get(trackId) ?? 'Unknown track',
			count,
			tier: count >= 5 ? 'Expert' : count >= 3 ? 'Skilled' : 'Novice'
		}))
		.sort((a, b) => b.count - a.count || a.trackName.localeCompare(b.trackName));

	const overallRank =
		completed.length >= 12
			? 'Master'
			: completed.length >= 8
				? 'Specialist'
				: completed.length >= 4
					? 'Builder'
					: completed.length >= 1
						? 'Apprentice'
						: 'Rookie';
	const masteredTracks = trackRanks.filter((t) => t.tier === 'Expert').length;
	const specialTitles = [
		...(masteredTracks >= 2 ? ['Cross-Track Ace'] : []),
		...(masteredTracks >= 3 ? ['Multi-Track Legend'] : [])
	];

	const secret = encoder.encode(process.env.PASSPORT_QR_SECRET ?? 'dev-secret-change-me');
	const token = await new SignJWT({ user_id: user.id })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('10m')
		.sign(secret);
	const qrDataUrl = await QRCode.toDataURL(token);

	return {
		profile,
		subteams: subteams ?? [],
		mentorTeamIds,
		qrDataUrl,
		badges,
		progressSummary,
		overallRank,
		trackRanks,
		specialTitles
	};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const form = await request.formData();
		const fullName = String(form.get('full_name') ?? '').trim();
		const bio = String(form.get('bio') ?? '').trim().slice(0, 500);
		let avatarUrl = String(form.get('avatar_url') ?? '').trim().slice(0, 2048);

		if (!fullName) return fail(400, { error: 'Display name is required.' });
		if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
			return fail(400, { error: 'Avatar URL must start with http(s)://' });
		}

		const { error } = await locals.supabase
			.from('profiles')
			.update({ full_name: fullName, bio, avatar_url: avatarUrl })
			.eq('id', user.id);
		if (error) return fail(400, { error: error.message });

		return { ok: true };
	},
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
		if (!user || !profile || !isMentor(profile)) return fail(403, { error: 'Forbidden' });

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
