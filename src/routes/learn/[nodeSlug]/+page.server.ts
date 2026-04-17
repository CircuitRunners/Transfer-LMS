import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { user, profile } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const previewRequested = url.searchParams.get('preview') === '1';
	const previewBypass = previewRequested && !!profile && ['mentor', 'admin'].includes(profile.role);

	const { data: node } = await locals.supabase
		.from('nodes')
		.select('id,title,description,video_url,subteam_id')
		.eq('slug', params.nodeSlug)
		.single();

	if (!node) throw error(404, 'Module not found');

	const [
		{ data: assessment },
		{ data: cert },
		{ data: statusRow },
		{ data: checkoff },
		{ data: submission },
		{ data: review },
		{ data: blocks },
		{ data: blockProgress },
		{ data: blockAttempts }
	] = await Promise.all([
		locals.supabase
			.from('assessments')
			.select('questions,passing_score')
			.eq('node_id', node.id)
			.maybeSingle(),
		locals.supabase
			.from('certifications')
			.select('status,quiz_score,quiz_passed_at,approved_at')
			.eq('node_id', node.id)
			.eq('user_id', user.id)
			.maybeSingle(),
		locals.supabase
			.from('v_user_node_status')
			.select('computed_status')
			.eq('node_id', node.id)
			.eq('user_id', user.id)
			.maybeSingle(),
		locals.supabase
			.from('node_checkoff_requirements')
			.select('title,directions,mentor_checklist,resource_links,evidence_mode')
			.eq('node_id', node.id)
			.maybeSingle(),
		locals.supabase
			.from('checkoff_submissions')
			.select('block_id,notes,photo_data_url,photo_data_urls,updated_at')
			.eq('node_id', node.id)
			.eq('user_id', user.id)
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
		locals.supabase
			.from('checkoff_reviews')
			.select('block_id,status,mentor_notes,checklist_results,updated_at')
			.eq('node_id', node.id)
			.eq('user_id', user.id)
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
		locals.supabase
			.from('node_blocks')
			.select('id,position,type,config')
			.eq('node_id', node.id)
			.order('position'),
		locals.supabase
			.from('user_node_block_progress')
			.select('block_id,completed_at,best_score')
			.eq('node_id', node.id)
			.eq('user_id', user.id),
		locals.supabase
			.from('block_quiz_attempts')
			.select('block_id,score,passed,created_at')
			.eq('node_id', node.id)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
			.limit(50)
	]);

	const computedStatus = statusRow?.computed_status ?? cert?.status ?? 'locked';
	const effectiveStatus = previewBypass && computedStatus === 'locked' ? 'available' : computedStatus;

	return {
		node,
		questions: assessment?.questions ?? [],
		passingScore: assessment?.passing_score ?? 80,
		certStatus: effectiveStatus,
		cert: cert ?? null,
		checkoff: checkoff ?? {
			title: 'Physical checkoff',
			directions: '',
			mentor_checklist: [],
			resource_links: [],
			evidence_mode: 'none'
		},
		submission: submission ?? null,
		review: review ?? null,
		blocks: blocks ?? [],
		blockProgress: blockProgress ?? [],
		blockAttempts: blockAttempts ?? [],
		previewBypass
	};
};

export const actions: Actions = {
	saveSubmission: async ({ locals, request, params }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const { data: node } = await locals.supabase
			.from('nodes')
			.select('id')
			.eq('slug', params.nodeSlug)
			.single();
		if (!node) return fail(404, { error: 'Module not found' });

		const form = await request.formData();
		const notes = String(form.get('notes') ?? '').trim();
		const blockIdRaw = String(form.get('block_id') ?? '').trim();
		const blockId = blockIdRaw || null;
		let photoDataUrls: string[] = [];
		try {
			photoDataUrls = JSON.parse(String(form.get('photo_data_urls_json') ?? '[]'));
		} catch {
			return fail(400, { error: 'Photo payload is invalid.', section: 'checkoff' });
		}
		if (!Array.isArray(photoDataUrls)) {
			return fail(400, { error: 'Photo payload is invalid.', section: 'checkoff' });
		}
		photoDataUrls = photoDataUrls
			.map((v) => String(v))
			.filter((v) => v.startsWith('data:image/'))
			.slice(0, 4);
		for (const photo of photoDataUrls) {
			if (photo.length > 1_500_000) {
				return fail(400, {
					error: 'One of the uploaded images is too large. Please use a smaller photo.',
					section: 'checkoff'
				});
			}
		}

		const { data: requirement } = await locals.supabase
			.from('node_checkoff_requirements')
			.select('evidence_mode')
			.eq('node_id', node.id)
			.maybeSingle();
		if (requirement?.evidence_mode === 'photo_required' && photoDataUrls.length === 0) {
			return fail(400, { error: 'At least one photo is required for this checkoff.', section: 'checkoff' });
		}

		const payload = {
			user_id: user.id,
			node_id: node.id,
			block_id: blockId,
			notes,
			photo_data_url: photoDataUrls[0] ?? null,
			photo_data_urls: photoDataUrls
		};
		let upsertError: { message: string } | null = null;
		const updateQuery = locals.supabase
			.from('checkoff_submissions')
			.update(payload)
			.eq('user_id', user.id)
			.eq('node_id', node.id);
		const { data: updatedRows, error: updateErr } = blockId
			? await updateQuery.eq('block_id', blockId).select('id').limit(1)
			: await updateQuery.is('block_id', null).select('id').limit(1);
		if (updateErr) upsertError = { message: updateErr.message };
		else if (!updatedRows || updatedRows.length === 0) {
			const { error: insertErr } = await locals.supabase.from('checkoff_submissions').insert(payload);
			if (insertErr) upsertError = { message: insertErr.message };
		}
		if (upsertError) return fail(400, { error: upsertError.message, section: 'checkoff' });

		await locals.supabase.rpc('transition_certification', {
			p_node_id: node.id,
			p_new_status: 'mentor_checkoff_pending',
			p_target_user_id: user.id
		});

		return { ok: true, section: 'checkoff' };
	}
};
