<script lang="ts">
	import CheckoffCard from '$lib/components/CheckoffCard.svelte';
	import QRScanner from '$lib/components/QRScanner.svelte';
	import { createBrowserClient } from '@supabase/ssr';
	import { env as publicEnv } from '$env/dynamic/public';
	import { onMount } from 'svelte';
	let { data } = $props();
	let queue = $state<any[]>([]);
	let queueSearch = $state('');
	let actionError = $state('');
	let selectedItem = $state<any | null>(null);
	let selectedImage = $state<string | null>(null);
	let scannedQrToken = $state('');
	let scannedStudentId = $state('');
	let scanMessage = $state('');
	const getHistoryNotes = (entry: any) => entry?.mentor_notes ?? '';
	const summary = $derived({
		total: queue.length,
		withEvidence: queue.filter((q) => (q.submission?.photo_data_urls?.length ?? 0) > 0 || q.submission?.photo_data_url).length,
		needsEvidence: queue.filter((q) => q.requirement?.evidence_mode === 'photo_required' && !(q.submission?.photo_data_urls?.length || q.submission?.photo_data_url)).length
	});
	const photosFor = (submission: any): string[] => {
		if (Array.isArray(submission?.photo_data_urls) && submission.photo_data_urls.length > 0) {
			return submission.photo_data_urls;
		}
		if (submission?.photo_data_url) return [submission.photo_data_url];
		return [];
	};
	const filteredQueue = $derived.by(() => {
		const needle = queueSearch.trim().toLowerCase();
		if (!needle) return queue;
		return queue.filter((item) => {
			const name = (item.profile?.full_name ?? item.profile?.email ?? '').toLowerCase();
			const course = (item.node?.title ?? '').toLowerCase();
			const team = (item.node?.subteam?.name ?? '').toLowerCase();
			return name.includes(needle) || course.includes(needle) || team.includes(needle);
		});
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

	const onDecodedForCheckoff = async (token: string) => {
		// First try direct checkoff-approval QR tokens.
		const approveRes = await fetch('/api/mentor/checkoff', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'approve', checkoffToken: token })
		});
		if (approveRes.ok) {
			const body = await approveRes.json().catch(() => null);
			scanMessage = 'Checkoff approved from QR.';
			const uid = String(body?.userId ?? '');
			const nid = String(body?.nodeId ?? '');
			if (uid && nid) {
				queue = queue.filter((entry: any) => !(String(entry.user_id) === uid && String(entry.node_id) === nid));
			}
			return;
		}

		// Fallback to passport scan flow.
		const res = await fetch('/api/mentor/resolve-qr', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			scanMessage = body?.error ?? 'Could not validate QR.';
			return;
		}
		scannedQrToken = token;
		scannedStudentId = body?.profile?.id ?? '';
		scanMessage = scannedStudentId ? 'Passport verified for checkoff actions.' : 'Passport scan succeeded.';
	};

	const onApprove = async (item: any, notes = '', checklist_results: any[] = []) => {
		const res = await fetch('/api/mentor/checkoff', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nodeId: item.node_id,
				userId: item.user_id,
				blockId: item.active_block_id ?? null,
				action: 'approve',
				notes,
				checklist_results,
				qrToken: scannedQrToken
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
				blockId: item.active_block_id ?? null,
				action: 'reset_quiz',
				notes,
				checklist_results,
				qrToken: scannedQrToken
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

</script>

<section class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold">Pending Checkoffs</h1>
		<div class="flex items-center gap-2">
			<a
				href="/scan"
				class="rounded border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
				>Scan hub</a
			>
			<a
				href="/mentor/courses"
				class="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
				>Manage courses →</a
			>
		</div>
	</div>
	{#if data.error || actionError}
		<div class="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">
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
			<a href="/mentor" class="rounded border border-slate-800 px-3 py-1.5 text-sm">Reset</a>
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
	<div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
		<input
			bind:value={queueSearch}
			placeholder="Search by student, course, or team..."
			class="w-full rounded border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
		/>
	</div>
	{#if !filteredQueue.length}
		<p class="text-slate-300">No students are waiting for checkoff.</p>
	{:else}
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredQueue as item}
				<div
					class="space-y-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3 transition hover:border-slate-500"
					role="button"
					tabindex="0"
					onclick={() => (selectedItem = item)}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							selectedItem = item;
						}
					}}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate font-semibold">{item.profile?.full_name || item.profile?.email}</p>
							<p class="truncate text-xs text-slate-400">{item.node?.title}</p>
						</div>
						<span class="rounded-full bg-sky-900/30 px-2 py-0.5 text-xs text-sky-200">Pending</span>
					</div>
					{#if photosFor(item.submission).length}
						<div class="grid grid-cols-3 gap-1">
							{#each photosFor(item.submission).slice(0, 3) as photo}
								<button
									type="button"
									onclick={(event) => {
										event.stopPropagation();
										selectedImage = photo;
									}}
								>
									<img src={photo} alt="Evidence" class="h-14 w-full rounded object-cover" />
								</button>
							{/each}
						</div>
					{/if}
					<div class="flex gap-2 pt-1">
						<button
							class="flex-1 rounded bg-emerald-600 px-2 py-1.5 text-sm font-semibold hover:bg-emerald-500"
							onclick={(event) => {
								event.stopPropagation();
								onApprove(item);
							}}
						>
							Accept
						</button>
						<button
							class="flex-1 rounded bg-amber-600 px-2 py-1.5 text-sm font-semibold hover:bg-amber-500"
							onclick={(event) => {
								event.stopPropagation();
								onResetQuiz(item);
							}}
						>
							Reject/Reset
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-lg font-semibold">Past Checkoffs</h2>
			<span class="text-xs text-slate-400">Most recent first</span>
		</div>
		<ul class="space-y-2 text-sm">
			{#each data.history as h}
				<li class="rounded border border-slate-800 bg-slate-900/40 p-2">
					<div class="flex items-center justify-between gap-2">
						<p>
							<span class="font-medium">{h.user?.full_name || h.user?.email}</span>
							· {h.node?.title}
						</p>
						<span class="text-xs text-slate-400">{new Date(h.updated_at).toLocaleString()}</span>
					</div>
					<p class="mt-1 text-xs text-slate-400">
						{h.kind === 'approved'
							? 'Approved'
							: h.kind === 'blocked'
								? 'Blocked'
								: h.kind === 'needs_review'
									? 'Requested checkoff retry'
									: 'Status update'}
					</p>
					{#if getHistoryNotes(h)}
						<p class="mt-1 text-xs text-slate-300">{getHistoryNotes(h)}</p>
					{/if}
				</li>
			{:else}
				<li class="text-slate-400">No past checkoffs yet.</li>
			{/each}
		</ul>
	</div>

	{#if selectedItem}
		<div
			class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
			role="button"
			tabindex="0"
			onclick={() => (selectedItem = null)}
			onkeydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') selectedItem = null;
			}}
		>
			<div
				class="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-4"
				onclick={(event) => event.stopPropagation()}
			>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Full Review</h2>
					<button
						class="rounded border border-slate-800 px-3 py-1 text-sm"
						onclick={(event) => {
							event.stopPropagation();
							selectedItem = null;
						}}
						>Close</button
					>
				</div>
				<CheckoffCard
					item={selectedItem}
					{onApprove}
					onReview={onResetQuiz}
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
