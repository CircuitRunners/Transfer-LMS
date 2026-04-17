<script lang="ts">
	type Question = {
		id: string;
		prompt: string;
		type: 'mc' | 'tf' | 'short';
		options?: string[];
		correct: string;
	};

	type VideoConfig = {
		title: string;
		video_url: string;
		start_seconds: number;
		end_seconds: number | null;
	};

	type QuizConfig = {
		title: string;
		passing_score: number;
		min_seconds_between_attempts: number;
		fail_window_minutes: number;
		max_failed_in_window: number;
		short_answer_min_chars: number;
		short_answer_max_chars: number;
		questions: Question[];
	};

	type CheckoffConfig = {
		title: string;
		directions: string;
		evidence_mode: 'none' | 'photo_optional' | 'photo_required';
		mentor_checklist: string[];
		resource_links: string[];
	};

	type BlockType = 'video' | 'quiz' | 'checkoff';
	type Block =
		| { id?: string; type: 'video'; config: VideoConfig }
		| { id?: string; type: 'quiz'; config: QuizConfig }
		| { id?: string; type: 'checkoff'; config: CheckoffConfig };

	let { data, form } = $props();
	const postedBlocks = $derived.by<Block[] | null>(() => {
		if (form?.section !== 'blocks' || !form?.blocks_json) return null;
		try {
			const parsed = JSON.parse(String(form.blocks_json));
			return Array.isArray(parsed) ? (parsed as Block[]) : null;
		} catch {
			return null;
		}
	});

	const initialBlocks = $derived<Block[]>(
		postedBlocks ??
			(Array.isArray(data.blocks)
				? (data.blocks as any[]).map((row) => {
					const cfg = row.config ?? {};
					if (row.type === 'video') {
						return {
							id: row.id,
							type: 'video',
							config: {
								title: String(cfg.title ?? ''),
								video_url: String(cfg.video_url ?? ''),
								start_seconds: Number(cfg.start_seconds ?? 0),
								end_seconds:
									cfg.end_seconds == null || cfg.end_seconds === '' ? null : Number(cfg.end_seconds)
							}
						} as Block;
					}
					if (row.type === 'quiz') {
						return {
							id: row.id,
							type: 'quiz',
							config: {
								title: String(cfg.title ?? ''),
								passing_score: Number(cfg.passing_score ?? 80),
								min_seconds_between_attempts: Number(cfg.min_seconds_between_attempts ?? 15),
								fail_window_minutes: Number(cfg.fail_window_minutes ?? 10),
								max_failed_in_window: Number(cfg.max_failed_in_window ?? 5),
								short_answer_min_chars: Number(cfg.short_answer_min_chars ?? 3),
								short_answer_max_chars: Number(cfg.short_answer_max_chars ?? 300),
								questions: Array.isArray(cfg.questions) ? (cfg.questions as Question[]) : []
							}
						} as Block;
					}
					return {
						id: row.id,
						type: 'checkoff',
						config: {
							title: String(cfg.title ?? 'Physical checkoff'),
							directions: String(cfg.directions ?? ''),
							evidence_mode:
								cfg.evidence_mode === 'photo_required' || cfg.evidence_mode === 'photo_optional'
									? cfg.evidence_mode
									: 'none',
							mentor_checklist: Array.isArray(cfg.mentor_checklist)
								? cfg.mentor_checklist.map((v: unknown) => String(v))
								: [],
							resource_links: Array.isArray(cfg.resource_links)
								? cfg.resource_links.map((v: unknown) => String(v))
								: []
						}
					} as Block;
				})
				: [])
	);

	let blocks = $state<Block[]>([]);
	let expandedIndex = $state<number | null>(null);
	$effect(() => {
		blocks = initialBlocks;
		expandedIndex = initialBlocks.length === 0 ? null : 0;
	});

	const blocksJson = $derived(JSON.stringify(blocks));
	const blockErrors = $derived((form?.block_errors as Record<number, string> | undefined) ?? {});

	let prereqFilter = $state('');
	const filteredNodes = $derived.by(() => {
		const needle = prereqFilter.trim().toLowerCase();
		if (!needle) return data.allNodes;
		return data.allNodes.filter((n: { title: string; slug: string }) =>
			(n.title + ' ' + n.slug).toLowerCase().includes(needle)
		);
	});

	function formatClock(totalSeconds: number | null | undefined): string {
		const seconds = Math.max(0, Math.trunc(Number(totalSeconds ?? 0)));
		const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
		const ss = (seconds % 60).toString().padStart(2, '0');
		return `${mm}:${ss}`;
	}

	function parseClock(input: string): number {
		const cleaned = input.trim();
		if (!cleaned) return 0;
		const parts = cleaned.split(':').map((v) => v.trim());
		if (parts.length === 1) return Math.max(0, Number(parts[0]) || 0);
		const mm = Math.max(0, Number(parts[0]) || 0);
		const ss = Math.max(0, Number(parts[1]) || 0);
		return Math.trunc(mm * 60 + ss);
	}

	function nextQuestionId(list: Question[]): string {
		const used = new Set(list.map((q) => q.id));
		let i = list.length + 1;
		while (used.has(`q${i}`)) i += 1;
		return `q${i}`;
	}

	function addBlock(type: BlockType) {
		if (type === 'video') {
			blocks.push({
				type: 'video',
				config: {
					title: '',
					video_url: data.node.video_url ?? '',
					start_seconds: 0,
					end_seconds: null
				}
			});
		} else if (type === 'quiz') {
			blocks.push({
				type: 'quiz',
				config: {
					title: '',
					passing_score: 80,
					min_seconds_between_attempts: 15,
					fail_window_minutes: 10,
					max_failed_in_window: 5,
					short_answer_min_chars: 3,
					short_answer_max_chars: 300,
					questions: []
				}
			});
		} else {
			blocks.push({
				type: 'checkoff',
				config: {
					title: 'Physical checkoff',
					directions: '',
					evidence_mode: 'none',
					mentor_checklist: [],
					resource_links: []
				}
			});
		}
		expandedIndex = blocks.length - 1;
	}

	function removeBlock(index: number) {
		blocks.splice(index, 1);
		if (expandedIndex === index) expandedIndex = null;
		else if (expandedIndex != null && expandedIndex > index) expandedIndex -= 1;
	}

	function moveBlock(index: number, direction: -1 | 1) {
		const next = index + direction;
		if (next < 0 || next >= blocks.length) return;
		const copy = [...blocks];
		const tmp = copy[index];
		copy[index] = copy[next];
		copy[next] = tmp;
		blocks = copy;
		if (expandedIndex === index) expandedIndex = next;
		else if (expandedIndex === next) expandedIndex = index;
	}

	function addQuizQuestion(block: Extract<Block, { type: 'quiz' }>) {
		block.config.questions = [
			...block.config.questions,
			{
				id: nextQuestionId(block.config.questions),
				prompt: '',
				type: 'mc',
				options: ['', ''],
				correct: ''
			}
		];
	}
	function removeQuizQuestion(block: Extract<Block, { type: 'quiz' }>, qIdx: number) {
		block.config.questions = block.config.questions.filter((_, i) => i !== qIdx);
	}
	function onQuestionTypeChange(q: Question) {
		if (q.type === 'mc') {
			if (!Array.isArray(q.options) || q.options.length < 2) q.options = ['', ''];
			if (!q.options.includes(q.correct)) q.correct = '';
		} else if (q.type === 'tf') {
			q.options = undefined;
			if (q.correct !== 'true' && q.correct !== 'false') q.correct = 'true';
		} else {
			q.options = undefined;
		}
	}

	function addChecklistItem(block: Extract<Block, { type: 'checkoff' }>) {
		block.config.mentor_checklist = [...block.config.mentor_checklist, ''];
	}
	function removeChecklistItem(block: Extract<Block, { type: 'checkoff' }>, idx: number) {
		block.config.mentor_checklist = block.config.mentor_checklist.filter((_, i) => i !== idx);
	}
	function addResourceLink(block: Extract<Block, { type: 'checkoff' }>) {
		block.config.resource_links = [...block.config.resource_links, ''];
	}
	function removeResourceLink(block: Extract<Block, { type: 'checkoff' }>, idx: number) {
		block.config.resource_links = block.config.resource_links.filter((_, i) => i !== idx);
	}

	function blockSummary(block: Block): string {
		if (block.type === 'video') {
			const v = block.config;
			const range =
				v.end_seconds != null
					? `${formatClock(v.start_seconds)} – ${formatClock(v.end_seconds)}`
					: `from ${formatClock(v.start_seconds)}`;
			return `${v.title || 'Untitled video'} · ${range}`;
		}
		if (block.type === 'quiz') {
			const q = block.config;
			const count = q.questions.length;
			return `${q.title || 'Quiz'} · ${count} question${count === 1 ? '' : 's'} · pass ${q.passing_score}%`;
		}
		const c = block.config;
		const evidenceLabel =
			c.evidence_mode === 'photo_required'
				? 'photo required'
				: c.evidence_mode === 'photo_optional'
					? 'photo optional'
					: 'no photo';
		return `${c.title || 'Checkoff'} · ${evidenceLabel}`;
	}

	function blockStyles(type: BlockType) {
		if (type === 'video') return 'border-sky-200/60 bg-sky-950/30';
		if (type === 'quiz') return 'border-yellow-700/60 bg-yellow-950/20';
		return 'border-emerald-200/60 bg-emerald-950/20';
	}
	function blockLabel(type: BlockType) {
		if (type === 'video') return 'Video';
		if (type === 'quiz') return 'Quiz';
		return 'Checkoff';
	}

	function handleDeleteSubmit(event: SubmitEvent) {
		const ok = confirm(
			'Delete this course? Student progress, its blocks, and prerequisites pointing to it will be removed. This cannot be undone.'
		);
		if (!ok) event.preventDefault();
	}

	const message = $derived.by(() => {
		if (form?.error) return { tone: 'error' as const, text: form.error };
		if (form?.ok) return { tone: 'ok' as const, text: 'Saved.' };
		return null;
	});
</script>

<section class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<a href="/mentor/courses" class="text-xs text-neutral-500">← All courses</a>
			<h1 class="text-2xl font-semibold">{data.node.title}</h1>
			<p class="text-xs text-neutral-500">
				<code class="rounded bg-neutral-100 px-1 py-0.5">{data.node.slug}</code>
			</p>
		</div>
		<div class="flex items-center gap-2">
			<a
				href={`/learn/${data.node.slug}`}
				class="rounded border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-100"
				>Preview as student</a
			>
			<form method="POST" action="?/deleteNode" onsubmit={handleDeleteSubmit}>
				<button
					type="submit"
					class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-900/60"
				>
					Delete
				</button>
			</form>
		</div>
	</div>

	{#if message}
		<div
			class="rounded border p-3 text-sm {message.tone === 'error'
				? 'border-red-200 bg-red-50 text-red-800'
				: 'border-emerald-200 bg-emerald-50 text-emerald-800'}"
		>
			{message.text}
		</div>
	{/if}

	<form
		method="POST"
		action="?/updateNode"
		class="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 md:grid-cols-2"
	>
		<h2 class="text-lg font-semibold md:col-span-2">Details</h2>
		<label class="flex flex-col gap-1 text-sm md:col-span-2">
			<span class="text-neutral-700">Title</span>
			<input class="rounded bg-neutral-100 px-2 py-2" name="title" value={data.node.title} required />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-neutral-700">Slug</span>
			<input class="rounded bg-neutral-100 px-2 py-2" name="slug" value={data.node.slug} required />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-neutral-700">Subteam</span>
			<select class="rounded bg-neutral-100 px-2 py-2" name="subteam_id" required>
				{#each data.subteams as team}
					<option value={team.id} selected={team.id === data.node.subteam_id}>{team.name}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1 text-sm md:col-span-2">
			<span class="text-neutral-700">Fallback video URL (used if no video blocks yet)</span>
			<input class="rounded bg-neutral-100 px-2 py-2" name="video_url" value={data.node.video_url ?? ''} />
		</label>
		<label class="flex flex-col gap-1 text-sm md:col-span-2">
			<span class="text-neutral-700">Description</span>
			<textarea class="rounded bg-neutral-100 px-2 py-2" name="description" rows="3"
				>{data.node.description ?? ''}</textarea
			>
		</label>
		<div class="flex justify-end md:col-span-2">
			<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900">
				Save details
			</button>
		</div>
	</form>

	<form
		method="POST"
		action="?/saveBlocks"
		class="space-y-4 rounded-xl border border-neutral-200 bg-white p-4"
	>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold">Course Builder</h2>
				<p class="text-xs text-neutral-500">
					Compose this course from ordered blocks. Students complete each block in sequence.
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="rounded border border-sky-200/60 bg-sky-950/40 px-3 py-1 text-sm hover:bg-sky-50"
					onclick={() => addBlock('video')}
				>
					+ Video
				</button>
				<button
					type="button"
					class="rounded border border-yellow-700/60 bg-yellow-950/40 px-3 py-1 text-sm hover:bg-yellow-900/40"
					onclick={() => addBlock('quiz')}
				>
					+ Quiz
				</button>
				<button
					type="button"
					class="rounded border border-emerald-200/60 bg-emerald-950/40 px-3 py-1 text-sm hover:bg-emerald-50"
					onclick={() => addBlock('checkoff')}
				>
					+ Checkoff
				</button>
			</div>
		</div>
		<input type="hidden" name="blocks_json" value={blocksJson} />

		<div class="space-y-2">
			{#each blocks as block, i (block.id ?? i)}
				<div class="rounded border p-3 {blockStyles(block.type)} {blockErrors[i] ? 'ring-1 ring-red-500' : ''}">
					<div class="flex flex-wrap items-center gap-2">
						<span class="inline-flex items-center rounded bg-neutral-50 px-2 py-0.5 text-xs font-semibold">
							{i + 1}. {blockLabel(block.type)}
						</span>
						<p class="truncate text-sm text-neutral-800">{blockSummary(block)}</p>
						<div class="ml-auto flex items-center gap-1">
							<button
								type="button"
								class="rounded border border-neutral-200 px-2 py-0.5 text-xs disabled:opacity-40"
								disabled={i === 0}
								onclick={() => moveBlock(i, -1)}
								title="Move up"
								aria-label="Move up"
							>▲</button>
							<button
								type="button"
								class="rounded border border-neutral-200 px-2 py-0.5 text-xs disabled:opacity-40"
								disabled={i === blocks.length - 1}
								onclick={() => moveBlock(i, 1)}
								title="Move down"
								aria-label="Move down"
							>▼</button>
							<button
								type="button"
								class="rounded border border-neutral-200 px-2 py-0.5 text-xs"
								onclick={() => (expandedIndex = expandedIndex === i ? null : i)}
							>
								{expandedIndex === i ? 'Collapse' : 'Edit'}
							</button>
							<button
								type="button"
								class="rounded border border-red-200/60 px-2 py-0.5 text-xs text-red-800"
								onclick={() => removeBlock(i)}
							>Remove</button>
						</div>
					</div>

					{#if expandedIndex === i}
						<div class="mt-3 space-y-3 rounded bg-white/60 p-3">
							{#if blockErrors[i]}
								<p class="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
									{blockErrors[i]}
								</p>
							{/if}
							{#if block.type === 'video'}
								<div class="grid gap-2 md:grid-cols-2">
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Title (shown to students)</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" bind:value={block.config.title} placeholder="e.g. Intro to Pneumatics" />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>YouTube URL</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" bind:value={block.config.video_url} placeholder="https://www.youtube.com/watch?v=..." />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Start time (mm:ss)</span>
										<input
											class="rounded bg-neutral-100 px-2 py-2 text-sm"
											value={formatClock(block.config.start_seconds)}
											onchange={(e) => (block.config.start_seconds = parseClock((e.currentTarget as HTMLInputElement).value))}
										/>
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>End time (mm:ss, optional)</span>
										<input
											class="rounded bg-neutral-100 px-2 py-2 text-sm"
											placeholder="e.g. 12:30"
											value={block.config.end_seconds == null ? '' : formatClock(block.config.end_seconds)}
											onchange={(e) => {
												const raw = (e.currentTarget as HTMLInputElement).value.trim();
												block.config.end_seconds = raw ? parseClock(raw) : null;
											}}
										/>
									</label>
								</div>
							{:else if block.type === 'quiz'}
								<div class="grid gap-2 md:grid-cols-2">
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Title</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" bind:value={block.config.title} placeholder="Quiz name (optional)" />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Passing score (%)</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" type="number" min="1" max="100" bind:value={block.config.passing_score} />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Min seconds between attempts</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" type="number" min="0" max="3600" bind:value={block.config.min_seconds_between_attempts} />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Failed-attempt window (minutes)</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" type="number" min="1" max="1440" bind:value={block.config.fail_window_minutes} />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Max failed in window</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" type="number" min="1" max="200" bind:value={block.config.max_failed_in_window} />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Short answer min / max chars</span>
										<div class="flex gap-2">
											<input class="w-full rounded bg-neutral-100 px-2 py-2 text-sm" type="number" min="0" max="5000" bind:value={block.config.short_answer_min_chars} />
											<input class="w-full rounded bg-neutral-100 px-2 py-2 text-sm" type="number" min="1" max="5000" bind:value={block.config.short_answer_max_chars} />
										</div>
									</label>
								</div>

								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<p class="text-xs font-semibold text-neutral-700">Questions</p>
										<button type="button" class="rounded border border-neutral-200 px-2 py-1 text-xs" onclick={() => addQuizQuestion(block)}>+ Add question</button>
									</div>
									{#each block.config.questions as q, qIdx (qIdx)}
										<div class="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-2">
											<div class="flex items-center justify-between">
												<span class="text-xs text-neutral-500">Q{qIdx + 1}</span>
												<button type="button" class="text-xs text-red-700" onclick={() => removeQuizQuestion(block, qIdx)}>Remove</button>
											</div>
											<input class="w-full rounded bg-neutral-100 px-2 py-2 text-sm" placeholder="Question prompt" bind:value={q.prompt} />
											<div class="flex items-center gap-2">
												<select class="rounded bg-neutral-100 px-2 py-2 text-sm" bind:value={q.type} onchange={() => onQuestionTypeChange(q)}>
													<option value="mc">Multiple choice</option>
													<option value="tf">True / False</option>
													<option value="short">Short answer</option>
												</select>
											</div>
											{#if q.type === 'mc'}
												<div class="space-y-1">
													{#each q.options ?? [] as _opt, oi (oi)}
														<div class="flex items-center gap-2">
															<input
																type="radio"
																name={`correct-${i}-${qIdx}`}
																checked={q.correct !== '' && q.correct === q.options![oi]}
																onchange={() => (q.correct = q.options![oi])}
															/>
															<input class="flex-1 rounded bg-neutral-100 px-2 py-1 text-sm" placeholder={`Option ${oi + 1}`} bind:value={q.options![oi]} />
														</div>
													{/each}
													<div class="flex gap-2 pt-1">
														<button type="button" class="rounded border border-neutral-200 px-2 py-0.5 text-xs" onclick={() => (q.options = [...(q.options ?? []), ''])}>+ Option</button>
													</div>
												</div>
											{:else if q.type === 'tf'}
												<div class="inline-flex overflow-hidden rounded border border-neutral-200">
													<button type="button" class={`px-4 py-1 text-sm ${q.correct === 'true' ? 'bg-yellow-400 text-slate-900' : 'bg-neutral-100 text-neutral-800'}`} onclick={() => (q.correct = 'true')}>True</button>
													<button type="button" class={`px-4 py-1 text-sm ${q.correct === 'false' ? 'bg-yellow-400 text-slate-900' : 'bg-neutral-100 text-neutral-800'}`} onclick={() => (q.correct = 'false')}>False</button>
												</div>
											{:else}
												<input class="w-full rounded bg-neutral-100 px-2 py-2 text-sm" placeholder="Expected answer" bind:value={q.correct} />
											{/if}
										</div>
									{:else}
										<p class="text-xs text-neutral-400">No questions yet.</p>
									{/each}
								</div>
							{:else}
								<div class="grid gap-2 md:grid-cols-2">
									<label class="flex flex-col gap-1 text-xs text-neutral-500 md:col-span-2">
										<span>Section title</span>
										<input class="rounded bg-neutral-100 px-2 py-2 text-sm" bind:value={block.config.title} />
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500 md:col-span-2">
										<span>Student directions</span>
										<textarea class="rounded bg-neutral-100 px-2 py-2 text-sm" rows="3" bind:value={block.config.directions} placeholder="Explain exactly what they must demo or submit..."></textarea>
									</label>
									<label class="flex flex-col gap-1 text-xs text-neutral-500">
										<span>Photo evidence</span>
										<select class="rounded bg-neutral-100 px-2 py-2 text-sm" bind:value={block.config.evidence_mode}>
											<option value="none">No photo</option>
											<option value="photo_optional">Photo optional</option>
											<option value="photo_required">Photo required</option>
										</select>
									</label>
								</div>

								<div class="grid gap-3 md:grid-cols-2">
									<div class="rounded border border-neutral-200 bg-neutral-50 p-2">
										<div class="mb-1 flex items-center justify-between">
											<p class="text-xs font-semibold text-neutral-700">Mentor checklist</p>
											<button type="button" class="rounded border border-neutral-200 px-2 py-0.5 text-xs" onclick={() => addChecklistItem(block)}>+ Item</button>
										</div>
										{#each block.config.mentor_checklist as _item, idx (idx)}
											<div class="flex items-center gap-1">
												<input class="flex-1 rounded bg-neutral-100 px-2 py-1 text-sm" bind:value={block.config.mentor_checklist[idx]} placeholder="e.g. Safety glasses worn" />
												<button type="button" class="px-2 text-xs text-red-700" onclick={() => removeChecklistItem(block, idx)}>×</button>
											</div>
										{:else}
											<p class="text-xs text-neutral-400">No checklist items yet.</p>
										{/each}
									</div>
									<div class="rounded border border-neutral-200 bg-neutral-50 p-2">
										<div class="mb-1 flex items-center justify-between">
											<p class="text-xs font-semibold text-neutral-700">Resource links</p>
											<button type="button" class="rounded border border-neutral-200 px-2 py-0.5 text-xs" onclick={() => addResourceLink(block)}>+ Link</button>
										</div>
										{#each block.config.resource_links as _link, idx (idx)}
											<div class="flex items-center gap-1">
												<input class="flex-1 rounded bg-neutral-100 px-2 py-1 text-sm" bind:value={block.config.resource_links[idx]} placeholder="https://..." />
												<button type="button" class="px-2 text-xs text-red-700" onclick={() => removeResourceLink(block, idx)}>×</button>
											</div>
										{:else}
											<p class="text-xs text-neutral-400">No links yet.</p>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<div class="rounded border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
					No blocks yet. Use the buttons above to add a video, quiz, or checkoff.
				</div>
			{/each}
		</div>

		<div class="flex justify-end">
			<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900">
				Save course
			</button>
		</div>
	</form>

	<form method="POST" action="?/savePrereqs" class="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
		<div>
			<h2 class="text-lg font-semibold">Prerequisites</h2>
			<p class="text-xs text-neutral-500">
				Students must complete these courses before starting this one.
			</p>
		</div>
		<input
			bind:value={prereqFilter}
			placeholder="Filter by title or slug..."
			class="w-full rounded bg-neutral-100 px-2 py-2 text-sm"
		/>
		<div class="grid max-h-80 gap-1 overflow-y-auto md:grid-cols-2">
			{#each filteredNodes as n (n.id)}
				<label class="flex items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-sm hover:bg-neutral-100">
					<input type="checkbox" name="prereq_ids" value={n.id} checked={data.prereqIds.includes(n.id)} />
					<span class="truncate">{n.title}</span>
					<span class="ml-auto text-xs text-neutral-400">{n.slug}</span>
				</label>
			{:else}
				<p class="text-sm text-neutral-500">No matching courses.</p>
			{/each}
		</div>
		<div class="flex justify-end">
			<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900">
				Save prerequisites
			</button>
		</div>
	</form>
</section>
