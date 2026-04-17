<script lang="ts">
	let { item, onApprove, onReview, onRetryCheckoff, onBlockCheckoff, onOpen, onImageOpen } = $props();

	let busy = $state<'' | 'approve' | 'review' | 'retry' | 'block'>('');
	let notes = $state('');
	let checklistStates = $state<Record<string, boolean>>({});

	const photosFor = (submission: any): string[] => {
		if (Array.isArray(submission?.photo_data_urls) && submission.photo_data_urls.length > 0) {
			return submission.photo_data_urls;
		}
		if (submission?.photo_data_url) return [submission.photo_data_url];
		return [];
	};

	$effect(() => {
		const initial: Record<string, boolean> = {};
		for (const row of item.review?.checklist_results ?? []) {
			const key = String(row?.item ?? '');
			if (key) initial[key] = !!row?.passed;
		}
		if (!Object.keys(initial).length) {
			for (const row of item.requirement?.mentor_checklist ?? []) {
				initial[String(row)] = false;
			}
		}
		checklistStates = initial;
		notes = item.review?.mentor_notes ?? '';
	});

	async function approve() {
		if (busy) return;
		busy = 'approve';
		try {
			const checklist_results = Object.entries(checklistStates).map(([item, passed]) => ({ item, passed }));
			await onApprove(item, notes.trim(), checklist_results);
		} finally {
			busy = '';
		}
	}

	async function review() {
		if (busy) return;
		const ok = confirm(
			`Reset quiz and send ${item.profile?.full_name || item.profile?.email} to try again?`
		);
		if (!ok) return;
		busy = 'review';
		try {
			const checklist_results = Object.entries(checklistStates).map(([item, passed]) => ({ item, passed }));
			await onReview(item, notes.trim(), checklist_results);
		} finally {
			busy = '';
		}
	}

	async function retryCheckoff() {
		if (busy) return;
		const ok = confirm(
			`Keep quiz pass and request checkoff rework for ${item.profile?.full_name || item.profile?.email}?`
		);
		if (!ok) return;
		busy = 'retry';
		try {
			const checklist_results = Object.entries(checklistStates).map(([item, passed]) => ({ item, passed }));
			await onRetryCheckoff(item, notes.trim(), checklist_results);
		} finally {
			busy = '';
		}
	}

	async function blockCheckoff() {
		if (busy) return;
		const ok = confirm(
			`Block this checkoff for ${item.profile?.full_name || item.profile?.email}? Use this for safety or major compliance issues.`
		);
		if (!ok) return;
		busy = 'block';
		try {
			const checklist_results = Object.entries(checklistStates).map(([item, passed]) => ({ item, passed }));
			await onBlockCheckoff(item, notes.trim(), checklist_results);
		} finally {
			busy = '';
		}
	}

	const statusToneClass = $derived.by(() => {
		switch (item.derivedCheckoffStatus) {
			case 'approved':
				return 'bg-emerald-900/40 text-emerald-200';
			case 'blocked':
				return 'bg-red-900/40 text-red-200';
			case 'needs_review':
				return 'bg-amber-900/40 text-amber-200';
			case 'submitted':
				return 'bg-sky-900/40 text-sky-200';
			default:
				return 'bg-slate-800 text-slate-300';
		}
	});

	const statusLabel = $derived.by(() => {
		switch (item.derivedCheckoffStatus) {
			case 'approved':
				return 'approved';
			case 'blocked':
				return 'blocked';
			case 'needs_review':
				return 'needs review';
			case 'submitted':
				return 'awaiting checkoff';
			default:
				return 'not submitted';
		}
	});
</script>

<div
	class="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 transition hover:border-slate-500"
	role="button"
	tabindex="0"
	onclick={() => onOpen?.(item)}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onOpen?.(item);
		}
	}}
>
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-semibold">{item.profile?.full_name || item.profile?.email}</p>
			<p class="text-xs text-slate-400">{item.profile?.email}</p>
		</div>
		<span class={`rounded-full px-2 py-0.5 text-xs ${statusToneClass}`}>{statusLabel}</span>
	</div>
	<div>
		<p class="text-sm font-medium text-slate-200">{item.node?.title}</p>
		<p class="mt-1 text-xs text-slate-500">
			Student team: {item.profile?.subteam?.name ?? 'Unassigned'} · Course team: {item.node?.subteam?.name ??
				'Unassigned'}
		</p>
		{#if item.requirement?.title || item.requirement?.directions}
			<p class="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				{item.requirement?.title || 'Physical checkoff'}
			</p>
			<p class="mt-1 rounded bg-slate-950/60 p-2 text-xs text-slate-300">
				{item.requirement?.directions || 'No student directions provided.'}
			</p>
		{/if}
		{#if (item.requirement?.mentor_checklist ?? []).length}
			<div class="mt-2 space-y-1 text-xs text-slate-300">
				<p class="font-semibold text-slate-400">Mentor checklist</p>
				{#each item.requirement.mentor_checklist as c}
					<label class="flex items-start gap-2 rounded px-2 py-1 hover:bg-slate-800/40">
						<input
							type="checkbox"
							class="mt-0.5 accent-yellow-400"
							checked={!!checklistStates[c]}
							onchange={(event) =>
								(checklistStates[c] = (event.currentTarget as HTMLInputElement).checked)}
						/>
						<span>{c}</span>
					</label>
				{/each}
			</div>
		{/if}
		{#if item.submission}
			<div class="mt-2 rounded border border-slate-700 bg-slate-950/40 p-2 text-xs">
				<p class="font-semibold text-slate-200">Student submission</p>
				<p class="mt-1 whitespace-pre-wrap text-slate-300">
					{item.submission.notes || 'No notes submitted.'}
				</p>
				{#if photosFor(item.submission).length}
					<div class="mt-2 grid grid-cols-3 gap-2">
						{#each photosFor(item.submission) as photo}
							<button type="button" onclick={(event) => { event.stopPropagation(); onImageOpen?.(photo); }}>
								<img src={photo} alt="Student evidence" class="h-16 w-full rounded object-cover" />
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else if item.requirement?.evidence_mode === 'photo_required'}
			<p class="mt-2 rounded border border-amber-700/60 bg-amber-900/20 p-2 text-xs text-amber-200">
				Photo evidence is required but student has not submitted one yet.
			</p>
		{/if}
		{#if item.review}
			<p class="mt-2 text-[11px] text-slate-500">
				Last review: {item.review.status} · {new Date(item.review.updated_at).toLocaleString()}
			</p>
		{/if}
	</div>
	<label class="flex flex-col gap-1 text-xs text-slate-400">
		<span>Mentor feedback</span>
		<textarea
			class="rounded bg-slate-800 px-2 py-2 text-sm text-slate-100"
			rows="2"
			placeholder="Feedback for the student..."
			bind:value={notes}
			disabled={!!busy}
		></textarea>
	</label>
	<div class="flex flex-wrap gap-2 pt-1">
		<button
			class="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
			onclick={(event) => {
				event.stopPropagation();
				approve();
			}}
			disabled={!!busy}
		>
			{busy === 'approve' ? 'Approving…' : 'Approve'}
		</button>
		<button
			class="rounded bg-amber-600 px-3 py-1 text-sm font-semibold hover:bg-amber-500 disabled:opacity-60"
			onclick={(event) => {
				event.stopPropagation();
				review();
			}}
			disabled={!!busy}
		>
			{busy === 'review' ? 'Resetting…' : 'Reset Quiz & Try Again'}
		</button>
		<button
			class="rounded bg-slate-700 px-3 py-1 text-sm font-semibold hover:bg-slate-600 disabled:opacity-60"
			onclick={(event) => {
				event.stopPropagation();
				retryCheckoff();
			}}
			disabled={!!busy}
		>
			{busy === 'retry' ? 'Saving…' : 'Retry Checkoff (Keep Quiz)'}
		</button>
		<button
			class="rounded bg-red-700 px-3 py-1 text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
			onclick={(event) => {
				event.stopPropagation();
				blockCheckoff();
			}}
			disabled={!!busy}
		>
			{busy === 'block' ? 'Blocking…' : 'Block Checkoff'}
		</button>
	</div>
</div>
