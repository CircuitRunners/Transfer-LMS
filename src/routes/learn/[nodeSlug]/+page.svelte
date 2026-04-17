<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import Quiz from '$lib/components/Quiz.svelte';

	type BlockType = 'video' | 'quiz' | 'checkoff';
	type LearnBlock = {
		id: string;
		type: BlockType;
		position: number;
		config: Record<string, any>;
		legacy: boolean;
	};

	let { data } = $props();

	function extractVideoId(url: string | null | undefined): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			const host = u.hostname.replace(/^www\./, '');
			if (host === 'youtu.be') {
				const id = u.pathname.slice(1);
				return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
			}
			if (host.endsWith('youtube.com')) {
				if (u.pathname === '/watch') {
					const id = u.searchParams.get('v') ?? '';
					return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
				}
				if (u.pathname.startsWith('/embed/')) {
					const id = u.pathname.split('/')[2] ?? '';
					return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
				}
			}
			return null;
		} catch {
			return null;
		}
	}

	const certStatus = $derived(data.certStatus as string);
	const reviewStatus = $derived((data.review?.status as string | undefined) ?? '');
	const effectiveStatus = $derived.by(() => {
		if (certStatus === 'mentor_checkoff_pending' && reviewStatus === 'needs_review') {
			return 'checkoff_needs_review';
		}
		if (certStatus === 'mentor_checkoff_pending' && reviewStatus === 'blocked') {
			return 'checkoff_blocked';
		}
		return certStatus;
	});
	const locked = $derived(certStatus === 'locked');
	const completed = $derived(certStatus === 'completed');

	const blocks = $derived.by<LearnBlock[]>(() => {
		const real = Array.isArray(data.blocks) ? (data.blocks as any[]) : [];
		if (real.length > 0) {
			return real.map((b) => ({
				id: String(b.id),
				type: b.type as BlockType,
				position: Number(b.position),
				config: (b.config ?? {}) as Record<string, any>,
				legacy: false
			}));
		}
		const synthesized: LearnBlock[] = [];
		const hasVideoUrl = Boolean((data.node.video_url ?? '').trim());
		const legacyQuestions = Array.isArray(data.questions) ? data.questions : [];
		const hasQuiz = legacyQuestions.length > 0;
		const c = data.checkoff ?? {};
		const hasMeaningfulCheckoff = Boolean(
			(c.directions ?? '').trim() ||
				(Array.isArray(c.mentor_checklist) && c.mentor_checklist.length > 0) ||
				(Array.isArray(c.resource_links) && c.resource_links.length > 0) ||
				c.evidence_mode === 'photo_optional' ||
				c.evidence_mode === 'photo_required'
		);
		let pos = 1;
		if (hasVideoUrl) {
			synthesized.push({
				id: `legacy-video-${data.node.id}`,
				type: 'video',
				position: pos++,
				config: { video_url: data.node.video_url, start_seconds: 0, end_seconds: null, title: data.node.title },
				legacy: true
			});
		}
		if (hasQuiz) {
			synthesized.push({
				id: `legacy-quiz-${data.node.id}`,
				type: 'quiz',
				position: pos++,
				config: { questions: legacyQuestions, passing_score: data.passingScore ?? 80, title: 'Quiz' },
				legacy: true
			});
		}
		if (hasMeaningfulCheckoff) {
			synthesized.push({
				id: `legacy-checkoff-${data.node.id}`,
				type: 'checkoff',
				position: pos++,
				config: c,
				legacy: true
			});
		}
		return synthesized;
	});

	const progressByBlockId = $derived.by(() => {
		const map = new Map<string, { completed_at: string | null; best_score: number | null }>();
		for (const row of (data.blockProgress ?? []) as any[]) {
			map.set(String(row.block_id), {
				completed_at: row.completed_at,
				best_score: row.best_score
			});
		}
		return map;
	});

	function legacyBlockCompleted(block: LearnBlock): boolean {
		if (block.type === 'video') {
			return (
				certStatus === 'quiz_pending' ||
				certStatus === 'mentor_checkoff_pending' ||
				certStatus === 'completed'
			);
		}
		if (block.type === 'quiz') {
			return certStatus === 'mentor_checkoff_pending' || certStatus === 'completed';
		}
		return certStatus === 'completed';
	}

	function isBlockCompleted(block: LearnBlock): boolean {
		if (block.legacy) return legacyBlockCompleted(block);
		return Boolean(progressByBlockId.get(block.id)?.completed_at);
	}

	const activeBlockIndex = $derived.by(() => {
		for (let i = 0; i < blocks.length; i += 1) {
			if (!isBlockCompleted(blocks[i])) return i;
		}
		return blocks.length;
	});

	const activeBlock = $derived(
		activeBlockIndex >= 0 && activeBlockIndex < blocks.length ? blocks[activeBlockIndex] : null
	);

	const allBlocksComplete = $derived(blocks.length > 0 && activeBlockIndex >= blocks.length);

	let marking = $state(false);
	async function markLegacyVideoDone() {
		if (marking) return;
		marking = true;
		try {
			await fetch('/api/nodes/video-complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ nodeId: data.node.id })
			});
			await invalidateAll();
		} finally {
			marking = false;
		}
	}

	async function markBlockVideoDone(block: LearnBlock) {
		if (marking) return;
		marking = true;
		try {
			await fetch('/api/nodes/block-complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ nodeId: data.node.id, blockId: block.id })
			});
			await invalidateAll();
		} finally {
			marking = false;
		}
	}

	const statusLabels: Record<string, { label: string; tone: string }> = {
		locked: { label: 'Locked — finish prerequisites first', tone: 'slate' },
		available: { label: 'Available', tone: 'slate' },
		video_pending: { label: 'In progress', tone: 'slate' },
		quiz_pending: { label: 'Quiz unlocked', tone: 'yellow' },
		mentor_checkoff_pending: { label: 'Awaiting mentor checkoff', tone: 'sky' },
		checkoff_needs_review: { label: 'Action required: redo checkoff', tone: 'yellow' },
		checkoff_blocked: { label: 'Blocked by mentor', tone: 'red' },
		completed: { label: 'Completed', tone: 'emerald' }
	};
	const statusInfo = $derived(
		statusLabels[effectiveStatus] ?? { label: effectiveStatus, tone: 'slate' }
	);

	const blockedByMentor = $derived(reviewStatus === 'blocked' && certStatus === 'mentor_checkoff_pending');
	const awaitingMentor = $derived(certStatus === 'mentor_checkoff_pending');

	const initialSubmissionPhotos = $derived.by(() => {
		if (Array.isArray(data.submission?.photo_data_urls) && data.submission.photo_data_urls.length > 0) {
			return data.submission.photo_data_urls as string[];
		}
		if (data.submission?.photo_data_url) return [data.submission.photo_data_url] as string[];
		return [] as string[];
	});
	let uploadPreviews = $state<string[]>([]);
	$effect(() => {
		uploadPreviews = initialSubmissionPhotos;
	});
	let checkoffMessage = $state('');

	async function compressImage(file: File): Promise<string> {
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(new Error('Could not read image'));
			reader.readAsDataURL(file);
		});
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error('Could not load image'));
			el.src = dataUrl;
		});
		const maxDim = 1280;
		const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
		const width = Math.max(1, Math.round(img.width * scale));
		const height = Math.max(1, Math.round(img.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return dataUrl;
		ctx.drawImage(img, 0, 0, width, height);
		return canvas.toDataURL('image/jpeg', 0.78);
	}

	async function onPhotoSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		const accepted = files.filter((f) => f.type.startsWith('image/')).slice(0, 4);
		if (!accepted.length) {
			checkoffMessage = 'Please choose image files.';
			return;
		}
		const compressed: string[] = [];
		for (const file of accepted) {
			const next = await compressImage(file);
			compressed.push(next);
		}
		uploadPreviews = compressed;
		checkoffMessage = 'Photos prepared and compressed for upload.';
	}

	function removePhoto(index: number) {
		uploadPreviews = uploadPreviews.filter((_, i) => i !== index);
		checkoffMessage = 'Photo removed. Save to persist this change.';
	}

	function blockTypeMeta(type: BlockType) {
		if (type === 'video')
			return { label: 'Video', chip: 'bg-sky-900/40 text-sky-200', border: 'border-sky-700/50' };
		if (type === 'quiz')
			return { label: 'Quiz', chip: 'bg-yellow-900/40 text-yellow-200', border: 'border-yellow-700/50' };
		return { label: 'Checkoff', chip: 'bg-emerald-900/40 text-emerald-200', border: 'border-emerald-700/50' };
	}

	function blockSummary(block: LearnBlock): string {
		const cfg = block.config;
		if (block.type === 'video') return String(cfg.title ?? 'Video');
		if (block.type === 'quiz') {
			const count = Array.isArray(cfg.questions) ? cfg.questions.length : 0;
			return `${cfg.title || 'Quiz'} · ${count} question${count === 1 ? '' : 's'}`;
		}
		return String(cfg.title ?? 'Checkoff');
	}
</script>

<section class="space-y-4">
	<div>
		<a href="/dashboard" class="text-xs text-slate-400">← Dashboard</a>
		<h1 class="text-2xl font-semibold">{data.node.title}</h1>
		{#if data.node.description}
			<p class="text-slate-300">{data.node.description}</p>
		{/if}
		<p class="mt-2 text-xs">
			<span
				class={`inline-flex rounded-full px-2 py-0.5 ${
					statusInfo.tone === 'emerald'
						? 'bg-emerald-900/40 text-emerald-200'
						: statusInfo.tone === 'red'
							? 'bg-red-900/40 text-red-200'
						: statusInfo.tone === 'sky'
							? 'bg-sky-900/40 text-sky-200'
							: statusInfo.tone === 'yellow'
								? 'bg-yellow-900/40 text-yellow-200'
								: 'bg-slate-800 text-slate-300'
				}`}
			>
				{statusInfo.label}
			</span>
		</p>
	</div>

	{#if locked}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
			This module is locked. Complete its prerequisites on the
			<a class="text-yellow-300 underline" href="/dashboard">dashboard</a> first.
		</div>
	{:else if blocks.length === 0}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
			No blocks have been added to this module yet. Ask a mentor to configure the course.
		</div>
	{:else}
		{#if blocks.length > 1}
			<div class="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
				{#each blocks as block, i (block.id)}
					{@const done = isBlockCompleted(block)}
					{@const active = i === activeBlockIndex && !done}
					{@const meta = blockTypeMeta(block.type)}
					<div
						class={`flex items-center gap-2 rounded border px-3 py-1.5 text-xs ${
							done
								? 'border-emerald-800 bg-emerald-900/30 text-emerald-200'
								: active
									? 'border-yellow-500 bg-yellow-500/10 text-yellow-200'
									: 'border-slate-800 bg-slate-950/40 text-slate-400'
						}`}
					>
						<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-[10px] font-semibold">{i + 1}</span>
						<span class={`rounded-full px-2 py-0.5 text-[10px] ${meta.chip}`}>{meta.label}</span>
						<span class="max-w-[12rem] truncate">{blockSummary(block)}</span>
						{#if done}
							<span class="text-emerald-300">✓</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if activeBlock}
			{@const meta = blockTypeMeta(activeBlock.type)}
			<div class={`space-y-4 rounded-xl border bg-slate-900 p-4 ${meta.border}`}>
				<div class="flex flex-wrap items-center gap-2">
					<span class={`rounded-full px-2 py-0.5 text-xs ${meta.chip}`}>
						{activeBlockIndex + 1}. {meta.label}
					</span>
					<h2 class="text-lg font-semibold">{blockSummary(activeBlock)}</h2>
				</div>

				{#if activeBlock.type === 'video'}
					{@const vid = extractVideoId(activeBlock.config.video_url)}
					{#if vid}
						<VideoPlayer
							videoId={vid}
							startSeconds={Number(activeBlock.config.start_seconds ?? 0)}
							endSeconds={activeBlock.config.end_seconds == null || activeBlock.config.end_seconds === ''
								? null
								: Number(activeBlock.config.end_seconds)}
							onCompleted={() =>
								activeBlock.legacy ? markLegacyVideoDone() : markBlockVideoDone(activeBlock)}
						/>
					{:else if activeBlock.config.video_url}
						<div class="space-y-2">
							<p class="text-sm text-slate-300">
								This video can't be embedded directly. Open it on YouTube to watch, then mark it done.
							</p>
							<a
								href={activeBlock.config.video_url}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
								>Open on YouTube ↗</a
							>
						</div>
					{:else}
						<p class="text-sm text-slate-400">No video URL configured for this block.</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
						<button
							class="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-60"
							onclick={() =>
								activeBlock.legacy ? markLegacyVideoDone() : markBlockVideoDone(activeBlock)}
							disabled={marking}
						>
							{marking ? 'Marking…' : 'I finished this video'}
						</button>
						<span class="text-xs text-slate-400">
							Marks this video complete and unlocks the next block.
						</span>
					</div>
				{:else if activeBlock.type === 'quiz'}
					{#if (activeBlock.config.questions ?? []).length === 0}
						<p class="text-sm text-slate-400">No quiz questions configured yet. Ask a mentor to add some.</p>
					{:else}
						<Quiz
							questions={activeBlock.config.questions}
							nodeId={data.node.id}
							blockId={activeBlock.legacy ? null : activeBlock.id}
							passingScore={activeBlock.config.passing_score ?? 80}
							allowSubmit={true}
							lockedMessage=""
						/>
					{/if}
				{:else}
					{@const c = activeBlock.config}
					{#if c.directions}
						<p class="text-sm text-slate-300">{c.directions}</p>
					{/if}
					{#if Array.isArray(c.mentor_checklist) && c.mentor_checklist.length > 0}
						<div class="rounded bg-slate-950/60 p-3">
							<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
								Mentor checklist
							</p>
							<ul class="list-disc space-y-1 pl-5 text-sm text-slate-200">
								{#each c.mentor_checklist as item}
									<li>{item}</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if Array.isArray(c.resource_links) && c.resource_links.length > 0}
						<div class="rounded bg-slate-950/60 p-3">
							<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Resources</p>
							<ul class="space-y-1 text-sm">
								{#each c.resource_links as link}
									<li>
										<a href={link} class="text-yellow-300 underline" target="_blank" rel="noopener noreferrer">{link}</a>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					<form
						method="POST"
						action="?/saveSubmission"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									checkoffMessage = 'Submission saved. A mentor will review soon.';
									await invalidateAll();
								}
								if (result.type === 'failure') {
									checkoffMessage = (result.data?.error as string) ?? 'Could not save submission.';
								}
							};
						}}
						class="space-y-3 rounded border border-slate-800 bg-slate-950/60 p-3"
					>
						{#if blockedByMentor}
							<p class="rounded border border-red-700 bg-red-900/20 p-2 text-xs text-red-200">
								This checkoff is blocked by a mentor. Resolve the feedback before further review.
							</p>
						{/if}
						<label class="flex flex-col gap-1 text-sm">
							<span class="text-slate-300">What did you complete?</span>
							<textarea
								name="notes"
								rows="3"
								class="rounded bg-slate-800 px-2 py-2"
								placeholder="Describe what you built/demonstrated, tools used, and any issues."
								disabled={blockedByMentor}
							>{data.submission?.notes ?? ''}</textarea>
						</label>
						<label class="flex flex-col gap-1 text-sm">
							<span class="text-slate-300">
								Photo evidence
								{#if c.evidence_mode === 'photo_required'}(required){/if}
								{#if c.evidence_mode === 'photo_optional'}(optional){/if}
							</span>
							<input
								type="file"
								accept="image/*"
								capture="environment"
								multiple
								onchange={onPhotoSelected}
								disabled={blockedByMentor}
							/>
							<input type="hidden" name="photo_data_urls_json" value={JSON.stringify(uploadPreviews)} />
						</label>
						{#if uploadPreviews.length}
							<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
								{#each uploadPreviews as photo, idx}
									<div class="relative">
										<img
											src={photo}
											alt="Checkoff submission preview"
											class="h-24 w-full rounded border border-slate-700 object-cover"
										/>
										<button
											type="button"
											onclick={() => removePhoto(idx)}
											class="absolute right-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] text-red-200"
										>
											Remove
										</button>
									</div>
								{/each}
							</div>
						{/if}
						{#if checkoffMessage}
							<p class="text-xs text-slate-300">{checkoffMessage}</p>
						{/if}
						<button
							class="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
							type="submit"
							disabled={blockedByMentor}
						>
							{blockedByMentor ? 'Blocked by mentor' : 'Save checkoff submission'}
						</button>
					</form>
					{#if data.review}
						<div class="rounded border border-slate-700 bg-slate-950/40 p-3 text-sm">
							<p class="font-semibold text-slate-200">Latest mentor feedback</p>
							<p class="mt-1 text-slate-300">{data.review.mentor_notes || 'No notes yet.'}</p>
							{#if data.review.status === 'needs_review'}
								<p class="mt-2 text-xs text-amber-200">
									Mentor requested updates. Your current submission stays saved; update notes/photos and save again.
								</p>
							{/if}
							{#if data.review.status === 'blocked'}
								<p class="mt-2 text-xs text-red-200">
									Mentor has blocked this checkoff pending safety/compliance resolution.
								</p>
							{/if}
							{#if (data.review.checklist_results ?? []).length > 0}
								<ul class="mt-2 list-disc pl-5 text-xs text-slate-300">
									{#each data.review.checklist_results as row}
										<li>{row.item}: {row.passed ? 'passed' : 'needs work'}</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}

	{#if awaitingMentor && !completed}
		<div class="rounded-xl border border-sky-700 bg-sky-900/20 p-4">
			<h2 class="mb-1 text-lg font-semibold">Awaiting mentor checkoff</h2>
			<p class="text-sm text-sky-100">
				Your checkoff submission is ready for mentor review.
			</p>
		</div>
	{/if}

	{#if completed || allBlocksComplete}
		<div class="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
			<h2 class="mb-1 text-lg font-semibold text-emerald-200">Completed</h2>
			<p class="text-sm text-emerald-100">
				You've finished this module{data.cert?.approved_at
					? ` on ${new Date(data.cert.approved_at).toLocaleDateString()}`
					: ''}.
			</p>
		</div>
	{/if}
</section>
