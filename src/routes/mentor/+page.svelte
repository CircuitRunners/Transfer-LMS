<script lang="ts">
	import CheckoffCard from '$lib/components/CheckoffCard.svelte';
	import { createBrowserClient } from '@supabase/ssr';
	import { env as publicEnv } from '$env/dynamic/public';
	import { onMount } from 'svelte';
	let { data } = $props();
	let queue = $state<any[]>([]);
	let actionError = $state('');
	let selectedItem = $state<any | null>(null);
	let selectedImage = $state<string | null>(null);
	const summary = $derived({
		total: queue.length,
		withEvidence: queue.filter((q) => (q.submission?.photo_data_urls?.length ?? 0) > 0 || q.submission?.photo_data_url).length,
		needsEvidence: queue.filter((q) => q.requirement?.evidence_mode === 'photo_required' && !(q.submission?.photo_data_urls?.length || q.submission?.photo_data_url)).length
	});
	const PUBLIC_SUPABASE_URL = publicEnv.PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
	const PUBLIC_SUPABASE_ANON_KEY = publicEnv.PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key';

	const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	onMount(() => {
		queue = data.queue ?? [];
		const channel = supabase
			.channel('mentor-queue')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'certifications' },
				async () => {
					const res = await fetch('/mentor');
					if (res.ok) location.reload();
				}
			)
			.subscribe();
		return () => {
			supabase.removeChannel(channel);
		};
	});

	const onApprove = async (item: any, notes = '', checklist_results: any[] = []) => {
		const res = await fetch('/api/mentor/checkoff', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nodeId: item.node_id,
				userId: item.user_id,
				action: 'approve',
				notes,
				checklist_results
			})
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			actionError = body?.error ?? 'Could not approve checkoff.';
			return;
		}
		actionError = '';
		queue = queue.filter((entry: any) => entry.id !== item.id);
		if (selectedItem?.id === item.id) selectedItem = null;
	};

	const onResetQuiz = async (item: any, notes = '', checklist_results: any[] = []) => {
		const res = await fetch('/api/mentor/checkoff', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nodeId: item.node_id,
				userId: item.user_id,
				action: 'reset_quiz',
				notes,
				checklist_results
			})
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			actionError = body?.error ?? 'Could not reset quiz.';
			return;
		}
		actionError = '';
		queue = queue.filter((entry: any) => entry.id !== item.id);
		if (selectedItem?.id === item.id) selectedItem = null;
	};

	const onRetryCheckoff = async (item: any, notes = '', checklist_results: any[] = []) => {
		const res = await fetch('/api/mentor/checkoff', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nodeId: item.node_id,
				userId: item.user_id,
				action: 'retry_checkoff',
				notes,
				checklist_results
			})
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			actionError = body?.error ?? 'Could not request checkoff retry.';
			return;
		}
		actionError = '';
		queue = queue.map((entry: any) =>
			entry.id === item.id
				? {
						...entry,
						derivedCheckoffStatus: 'needs_review',
						review: {
							...(entry.review ?? {}),
							status: 'needs_review',
							mentor_notes: notes,
							checklist_results,
							updated_at: new Date().toISOString()
						}
					}
				: entry
		);
		if (selectedItem?.id === item.id) {
			selectedItem = queue.find((entry: any) => entry.id === item.id) ?? selectedItem;
		}
	};

	const onBlockCheckoff = async (item: any, notes = '', checklist_results: any[] = []) => {
		const res = await fetch('/api/mentor/checkoff', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nodeId: item.node_id,
				userId: item.user_id,
				action: 'block_checkoff',
				notes,
				checklist_results
			})
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			actionError = body?.error ?? 'Could not block checkoff.';
			return;
		}
		actionError = '';
		queue = queue.map((entry: any) =>
			entry.id === item.id
				? {
						...entry,
						derivedCheckoffStatus: 'blocked',
						review: {
							...(entry.review ?? {}),
							status: 'blocked',
							mentor_notes: notes,
							checklist_results,
							updated_at: new Date().toISOString()
						}
					}
				: entry
		);
		if (selectedItem?.id === item.id) {
			selectedItem = queue.find((entry: any) => entry.id === item.id) ?? selectedItem;
		}
	};
</script>

<section class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold">Pending Checkoffs</h1>
		<a
			href="/mentor/courses"
			class="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
			>Manage courses →</a
		>
	</div>
	{#if data.error || actionError}
		<div class="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-100">
			{data.error || actionError}
		</div>
	{/if}
	<div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
		<form method="GET" class="flex flex-wrap items-center gap-2">
			<label for="scope" class="text-xs text-slate-400">Scope</label>
			<select id="scope" name="scope" class="rounded bg-slate-800 px-2 py-1.5 text-sm">
				<option value="mine" selected={data.scope === 'mine'}>My teams</option>
				<option value="all" selected={data.scope === 'all'}>All teams</option>
			</select>
			<select name="team" class="rounded bg-slate-800 px-2 py-1.5 text-sm">
				<option value="">All course teams</option>
				{#each data.subteams as team}
					<option value={team.id} selected={team.id === data.selectedTeamId}>{team.name}</option>
				{/each}
			</select>
			<button class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600" type="submit"
				>Apply</button
			>
			<a href="/mentor" class="rounded border border-slate-700 px-3 py-1.5 text-sm">Reset</a>
			<a href="/teams" class="ml-auto text-xs text-yellow-300 underline">Edit team preferences</a>
		</form>
		{#if data.scope === 'mine' && data.mentorTeamIds?.length === 0}
			<p class="mt-2 text-xs text-amber-200">
				No mentor teams selected yet, so "My teams" currently shows all checkoffs.
			</p>
		{/if}
	</div>
	<div class="grid gap-2 md:grid-cols-3">
		<div class="rounded border border-slate-800 bg-slate-900 p-3 text-sm">
			<p class="text-xs text-slate-400">Pending</p>
			<p class="text-xl font-semibold">{summary.total}</p>
		</div>
		<div class="rounded border border-slate-800 bg-slate-900 p-3 text-sm">
			<p class="text-xs text-slate-400">With evidence</p>
			<p class="text-xl font-semibold text-emerald-200">{summary.withEvidence}</p>
		</div>
		<div class="rounded border border-slate-800 bg-slate-900 p-3 text-sm">
			<p class="text-xs text-slate-400">Missing required evidence</p>
			<p class="text-xl font-semibold text-amber-200">{summary.needsEvidence}</p>
		</div>
	</div>
	{#if !queue.length}
		<p class="text-slate-300">No students are waiting for checkoff.</p>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			{#each queue as item}
				<CheckoffCard
					{item}
					{onApprove}
					onReview={onResetQuiz}
					onRetryCheckoff={onRetryCheckoff}
					{onBlockCheckoff}
					onOpen={(next: any) => (selectedItem = next)}
					onImageOpen={(url: string) => (selectedImage = url)}
				/>
			{/each}
		</div>
	{/if}

	{#if selectedItem}
		<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
			<div class="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Full Review</h2>
					<button class="rounded border border-slate-700 px-3 py-1 text-sm" onclick={() => (selectedItem = null)}
						>Close</button
					>
				</div>
				<CheckoffCard
					item={selectedItem}
					{onApprove}
					onReview={onResetQuiz}
					onRetryCheckoff={onRetryCheckoff}
					{onBlockCheckoff}
					onOpen={() => {}}
					onImageOpen={(url: string) => (selectedImage = url)}
				/>
			</div>
		</div>
	{/if}

	{#if selectedImage}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
			role="button"
			tabindex="0"
			onclick={() => (selectedImage = null)}
			onkeydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') selectedImage = null;
			}}
		>
			<img
				src={selectedImage}
				alt="Submission evidence full screen"
				class="max-h-full max-w-full object-contain"
			/>
		</div>
	{/if}
</section>
