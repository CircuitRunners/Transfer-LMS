import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const slugify = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

type BlockType = 'video' | 'quiz' | 'checkoff';
type BlockDraft = {
	id?: string;
	type: BlockType;
	config: Record<string, unknown>;
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(n)));
};

function normalizeVideoConfig(raw: any) {
	const title = String(raw?.title ?? '').trim();
	const video_url = String(raw?.video_url ?? '').trim();
	const start_seconds = Math.max(0, Math.trunc(Number(raw?.start_seconds ?? 0)) || 0);
	const endRaw = Number(raw?.end_seconds);
	const end_seconds = Number.isFinite(endRaw) && endRaw > 0 ? Math.trunc(endRaw) : null;
	return { title, video_url, start_seconds, end_seconds };
}

function normalizeQuizConfig(raw: any) {
	const title = String(raw?.title ?? '').trim();
	const passing_score = clampInt(raw?.passing_score, 80, 1, 100);
	const min_seconds_between_attempts = clampInt(raw?.min_seconds_between_attempts, 15, 0, 3600);
	const fail_window_minutes = clampInt(raw?.fail_window_minutes, 10, 1, 1440);
	const max_failed_in_window = clampInt(raw?.max_failed_in_window, 5, 1, 200);
	const short_answer_min_chars = clampInt(raw?.short_answer_min_chars, 3, 0, 5000);
	const short_answer_max_chars = clampInt(raw?.short_answer_max_chars, 300, 1, 5000);
	const questions = Array.isArray(raw?.questions) ? raw.questions : [];
	return {
		title,
		passing_score,
		min_seconds_between_attempts,
		fail_window_minutes,
		max_failed_in_window,
		short_answer_min_chars,
		short_answer_max_chars,
		questions
	};
}

function normalizeCheckoffConfig(raw: any) {
	const validEvidence = new Set(['none', 'photo_optional', 'photo_required']);
	const title = String(raw?.title ?? '').trim() || 'Physical checkoff';
	const directions = String(raw?.directions ?? '').trim();
	const evidence_mode = validEvidence.has(String(raw?.evidence_mode))
		? String(raw?.evidence_mode)
		: 'none';
	const mentor_checklist = Array.isArray(raw?.mentor_checklist)
		? raw.mentor_checklist
				.map((v: unknown) => String(v ?? '').trim())
				.filter(Boolean)
		: [];
	const resource_links = Array.isArray(raw?.resource_links)
		? raw.resource_links.map((v: unknown) => String(v ?? '').trim()).filter(Boolean)
		: [];
	return { title, directions, evidence_mode, mentor_checklist, resource_links };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { data: node, error: nodeErr } = await locals.supabase
		.from('nodes')
		.select('id,title,slug,description,video_url,subteam_id')
		.eq('slug', params.slug)
		.single();
	if (nodeErr || !node) throw error(404, 'Course not found');

	const [subteamsResp, prereqsResp, allNodesResp, blocksResp] = await Promise.all([
		locals.supabase.from('subteams').select('id,name').order('name'),
		locals.supabase.from('node_prerequisites').select('prerequisite_node_id').eq('node_id', node.id),
		locals.supabase
			.from('nodes')
			.select('id,title,slug,subteam_id')
			.neq('id', node.id)
			.order('title'),
		locals.supabase
			.from('node_blocks')
			.select('id,position,type,config')
			.eq('node_id', node.id)
			.order('position')
	]);

	return {
		node,
		subteams: subteamsResp.data ?? [],
		prereqIds: (prereqsResp.data ?? []).map((p: { prerequisite_node_id: string }) =>
			p.prerequisite_node_id
		),
		allNodes: allNodesResp.data ?? [],
		blocks: blocksResp.data ?? []
	};
};

export const actions: Actions = {
	updateNode: async ({ locals, params, request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const rawSlug = String(form.get('slug') ?? '').trim();
		const slug = rawSlug ? slugify(rawSlug) : slugify(title);
		const subteamId = String(form.get('subteam_id') ?? '');
		const videoUrl = String(form.get('video_url') ?? '').trim();
		const description = String(form.get('description') ?? '');

		if (!title || !slug || !subteamId) {
			return fail(400, { error: 'Title, slug, and subteam are required.', section: 'details' });
		}

		const { error: err } = await locals.supabase
			.from('nodes')
			.update({
				title,
				slug,
				subteam_id: subteamId,
				video_url: videoUrl,
				description
			})
			.eq('slug', params.slug);

		if (err) return fail(400, { error: err.message, section: 'details' });

		if (slug !== params.slug) throw redirect(303, `/mentor/courses/${slug}`);
		return { ok: true, section: 'details' };
	},

	saveBlocks: async ({ locals, params, request }) => {
		const form = await request.formData();
		const rawBlocksJson = String(form.get('blocks_json') ?? '[]');
		let draftBlocks: BlockDraft[] = [];
		try {
			draftBlocks = JSON.parse(rawBlocksJson);
		} catch {
			return fail(400, {
				error: 'Block payload is malformed.',
				section: 'blocks',
				blocks_json: rawBlocksJson
			});
		}
		if (!Array.isArray(draftBlocks)) {
			return fail(400, {
				error: 'Blocks must be an array.',
				section: 'blocks',
				blocks_json: rawBlocksJson
			});
		}

		const { data: nodeRow } = await locals.supabase
			.from('nodes')
			.select('id')
			.eq('slug', params.slug)
			.single();
		if (!nodeRow) {
			return fail(404, { error: 'Course not found', section: 'blocks', blocks_json: rawBlocksJson });
		}

		const rows: Array<{ id?: string; node_id: string; position: number; type: BlockType; config: object }> = [];
		const blockErrors: Record<number, string> = {};
		for (let i = 0; i < draftBlocks.length; i += 1) {
			const block = draftBlocks[i];
			const type = block.type as BlockType;
			if (!['video', 'quiz', 'checkoff'].includes(type)) {
				blockErrors[i] = `Unknown block type at position ${i + 1}.`;
				continue;
			}
			let config: Record<string, unknown>;
			if (type === 'video') {
				const v = normalizeVideoConfig(block.config);
				if (!v.video_url) {
					blockErrors[i] = `Video block #${i + 1} needs a YouTube URL.`;
					continue;
				}
				if (v.end_seconds != null && v.end_seconds <= v.start_seconds) {
					blockErrors[i] = `Video block #${i + 1} has an invalid end time.`;
					continue;
				}
				config = v;
			} else if (type === 'quiz') {
				const q = normalizeQuizConfig(block.config);
				if (q.short_answer_max_chars < q.short_answer_min_chars) {
					blockErrors[i] = `Quiz block #${i + 1} has min > max for short answer length.`;
					continue;
				}
				if (!Array.isArray(q.questions) || q.questions.length === 0) {
					blockErrors[i] = `Quiz block #${i + 1} needs at least one question.`;
					continue;
				}
				config = q;
			} else {
				config = normalizeCheckoffConfig(block.config);
			}
			rows.push({ id: block.id, node_id: nodeRow.id, position: i + 1, type, config });
		}

		if (Object.keys(blockErrors).length > 0) {
			return fail(400, {
				error: 'Please fix the highlighted block errors.',
				section: 'blocks',
				block_errors: blockErrors,
				blocks_json: rawBlocksJson
			});
		}

		const { data: existingBlocks, error: existingErr } = await locals.supabase
			.from('node_blocks')
			.select('id')
			.eq('node_id', nodeRow.id);
		if (existingErr) {
			return fail(400, {
				error: existingErr.message,
				section: 'blocks',
				blocks_json: rawBlocksJson
			});
		}
		const existingIds = new Set((existingBlocks ?? []).map((b: any) => String(b.id)));

		// Move current rows out of the way to prevent unique(node_id, position) collisions during reorder.
		const { error: shiftErr } = await locals.supabase
			.from('node_blocks')
			.update({ position: 1000000 })
			.eq('node_id', nodeRow.id);
		if (shiftErr) {
			return fail(400, {
				error: shiftErr.message,
				section: 'blocks',
				blocks_json: rawBlocksJson
			});
		}

		const keepIds: string[] = [];
		for (const row of rows) {
			const persistedId = row.id ? String(row.id) : '';
			if (persistedId && existingIds.has(persistedId)) {
				const { data: updated, error: updateErr } = await locals.supabase
					.from('node_blocks')
					.update({
						position: row.position,
						type: row.type,
						config: row.config
					})
					.eq('id', persistedId)
					.eq('node_id', nodeRow.id)
					.select('id')
					.single();
				if (updateErr) {
					return fail(400, {
						error: updateErr.message,
						section: 'blocks',
						blocks_json: rawBlocksJson
					});
				}
				if (updated?.id) keepIds.push(String(updated.id));
			} else {
				const { data: inserted, error: insertErr } = await locals.supabase
					.from('node_blocks')
					.insert({
						node_id: row.node_id,
						position: row.position,
						type: row.type,
						config: row.config
					})
					.select('id')
					.single();
				if (insertErr) {
					return fail(400, {
						error: insertErr.message,
						section: 'blocks',
						blocks_json: rawBlocksJson
					});
				}
				if (inserted?.id) keepIds.push(String(inserted.id));
			}
		}

		if (keepIds.length > 0) {
			const deleteIds = (existingBlocks ?? [])
				.map((b: any) => String(b.id))
				.filter((id: string) => !keepIds.includes(id));
			if (deleteIds.length > 0) {
				const { error: deleteMissingErr } = await locals.supabase
					.from('node_blocks')
					.delete()
					.eq('node_id', nodeRow.id)
					.in('id', deleteIds);
				if (deleteMissingErr) {
					return fail(400, {
						error: deleteMissingErr.message,
						section: 'blocks',
						blocks_json: rawBlocksJson
					});
				}
			}
		} else {
			const { error: clearErr } = await locals.supabase
				.from('node_blocks')
				.delete()
				.eq('node_id', nodeRow.id);
			if (clearErr) {
				return fail(400, {
					error: clearErr.message,
					section: 'blocks',
					blocks_json: rawBlocksJson
				});
			}
		}

		const checkoffBlock = rows.find((r) => r.type === 'checkoff');
		if (checkoffBlock) {
			const cfg = checkoffBlock.config as ReturnType<typeof normalizeCheckoffConfig>;
			await locals.supabase.from('node_checkoff_requirements').upsert(
				{
					node_id: nodeRow.id,
					title: cfg.title,
					directions: cfg.directions,
					mentor_checklist: cfg.mentor_checklist,
					resource_links: cfg.resource_links,
					evidence_mode: cfg.evidence_mode
				},
				{ onConflict: 'node_id' }
			);
		} else {
			await locals.supabase.from('node_checkoff_requirements').upsert(
				{
					node_id: nodeRow.id,
					title: 'Physical checkoff',
					directions: '',
					mentor_checklist: [],
					resource_links: [],
					evidence_mode: 'none'
				},
				{ onConflict: 'node_id' }
			);
		}

		const quizBlocks = rows.filter((r) => r.type === 'quiz');
		const firstQuiz = quizBlocks[0]?.config as ReturnType<typeof normalizeQuizConfig> | undefined;
		if (firstQuiz) {
			await locals.supabase.from('assessments').upsert(
				{
					node_id: nodeRow.id,
					passing_score: firstQuiz.passing_score,
					questions: firstQuiz.questions,
					min_seconds_between_attempts: firstQuiz.min_seconds_between_attempts,
					fail_window_minutes: firstQuiz.fail_window_minutes,
					max_failed_in_window: firstQuiz.max_failed_in_window,
					short_answer_min_chars: firstQuiz.short_answer_min_chars,
					short_answer_max_chars: firstQuiz.short_answer_max_chars
				},
				{ onConflict: 'node_id' }
			);
		}

		return { ok: true, section: 'blocks' };
	},

	savePrereqs: async ({ locals, params, request }) => {
		const form = await request.formData();
		const ids = form
			.getAll('prereq_ids')
			.map((v) => String(v))
			.filter(Boolean);

		const { data: nodeRow } = await locals.supabase
			.from('nodes')
			.select('id')
			.eq('slug', params.slug)
			.single();
		if (!nodeRow) return fail(404, { error: 'Course not found', section: 'prereqs' });

		const { error: delErr } = await locals.supabase
			.from('node_prerequisites')
			.delete()
			.eq('node_id', nodeRow.id);
		if (delErr) return fail(400, { error: delErr.message, section: 'prereqs' });

		if (ids.length) {
			const insertRows = ids
				.filter((id) => id !== nodeRow.id)
				.map((id) => ({ node_id: nodeRow.id, prerequisite_node_id: id }));
			if (insertRows.length) {
				const { error: insErr } = await locals.supabase
					.from('node_prerequisites')
					.insert(insertRows);
				if (insErr) return fail(400, { error: insErr.message, section: 'prereqs' });
			}
		}
		return { ok: true, section: 'prereqs' };
	},

	deleteNode: async ({ locals, params }) => {
		const { error: err } = await locals.supabase
			.from('nodes')
			.delete()
			.eq('slug', params.slug);
		if (err) return fail(400, { error: err.message, section: 'delete' });
		throw redirect(303, '/mentor/courses');
	}
};
