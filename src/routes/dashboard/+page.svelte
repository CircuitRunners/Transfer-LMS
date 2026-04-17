<script lang="ts">
	type Node = { id: string; title: string; slug: string; subteam_id: string };
	type Status = { node_id: string; computed_status: string };
	type Subteam = { id: string; name: string; slug: string };
	type CheckoffReview = { node_id: string; status: 'needs_review' | 'blocked'; updated_at: string };
	type PrereqEdge = { node_id: string; prerequisite_node_id: string };

	let { data } = $props();

	const statusMap = $derived(new Map((data.statuses as Status[]).map((s) => [s.node_id, s.computed_status])));
	const checkoffReviewMap = $derived(
		new Map((data.checkoffReviews as CheckoffReview[]).map((r) => [r.node_id, r]))
	);

	const effectiveStatusFor = (nodeId: string): string => {
		const base = statusMap.get(nodeId) ?? 'locked';
		if (base === 'mentor_checkoff_pending') {
			const review = checkoffReviewMap.get(nodeId);
			if (review?.status === 'needs_review') return 'checkoff_needs_review';
			if (review?.status === 'blocked') return 'checkoff_blocked';
		}
		return base;
	};

	let filter = $state('');
	let onlyUnfinished = $state(false);
	let showOtherCourses = $state(false);
	let showCompletedCourses = $state(false);

	const filtered = $derived.by(() => {
		const needle = filter.trim().toLowerCase();
		return (data.nodes as Node[]).filter((n) => {
			const status = effectiveStatusFor(n.id);
			if (onlyUnfinished && status === 'completed') return false;
			if (!needle) return true;
			return n.title.toLowerCase().includes(needle) || n.slug.toLowerCase().includes(needle);
		});
	});

	const primaryTeamId = $derived((data.profile?.subteam_id as string | null | undefined) ?? null);
	const prerequisites = $derived((data.prerequisites as PrereqEdge[]) ?? []);
	const prereqDependentsCount = $derived.by(() => {
		const map = new Map<string, number>();
		for (const edge of prerequisites) {
			map.set(edge.prerequisite_node_id, (map.get(edge.prerequisite_node_id) ?? 0) + 1);
		}
		return map;
	});

	const inPrimaryTeam = (node: Node) =>
		!primaryTeamId || String(node.subteam_id ?? '') === String(primaryTeamId);
	const byPriority = (a: Node, b: Node) => {
		const depDelta =
			(prereqDependentsCount.get(b.id) ?? 0) - (prereqDependentsCount.get(a.id) ?? 0);
		if (depDelta !== 0) return depDelta;
		return a.title.localeCompare(b.title);
	};

	const primaryNodes = $derived(filtered.filter(inPrimaryTeam));
	const otherNodes = $derived(filtered.filter((n) => !inPrimaryTeam(n)));
	const takeableStatuses = ['available', 'video_pending', 'quiz_pending'];

	const takeablePrimary = $derived(
		primaryNodes
			.filter((n) => takeableStatuses.includes(effectiveStatusFor(n.id)))
			.slice()
			.sort(byPriority)
	);
	const inProgressPrimary = $derived(
		primaryNodes
			.filter((n) =>
				['mentor_checkoff_pending', 'checkoff_needs_review', 'checkoff_blocked'].includes(
					effectiveStatusFor(n.id)
				)
			)
			.slice()
			.sort(byPriority)
	);
	const lockedPrimary = $derived(
		primaryNodes
			.filter((n) => effectiveStatusFor(n.id) === 'locked')
			.slice()
			.sort(byPriority)
	);
	const completedPrimary = $derived(
		primaryNodes
			.filter((n) => effectiveStatusFor(n.id) === 'completed')
			.slice()
			.sort(byPriority)
	);

	const otherTakeable = $derived(
		otherNodes
			.filter((n) => takeableStatuses.includes(effectiveStatusFor(n.id)))
			.slice()
			.sort(byPriority)
	);
	const otherRemaining = $derived(
		otherNodes
			.filter((n) => !takeableStatuses.includes(effectiveStatusFor(n.id)))
			.slice()
			.sort(byPriority)
	);

	const summary = $derived.by(() => {
		const counts = { total: 0, completed: 0, inProgress: 0, locked: 0 };
		for (const n of data.nodes as Node[]) {
			counts.total += 1;
			const status = effectiveStatusFor(n.id);
			if (status === 'completed') counts.completed += 1;
			else if (status === 'locked') counts.locked += 1;
			else counts.inProgress += 1;
		}
		return counts;
	});

	const availableNow = $derived(
		(data.nodes as Node[]).filter((n) => takeableStatuses.includes(effectiveStatusFor(n.id)))
	);
	const redoCheckoff = $derived(
		(data.nodes as Node[]).filter((n) => effectiveStatusFor(n.id) === 'checkoff_needs_review')
	);
	const blockedCheckoff = $derived(
		(data.nodes as Node[]).filter((n) => effectiveStatusFor(n.id) === 'checkoff_blocked')
	);
	const awaitingMentor = $derived(
		(data.nodes as Node[]).filter((n) => effectiveStatusFor(n.id) === 'mentor_checkoff_pending')
	);
	const recommendedNext = $derived.by(() => {
		const preferredTeam = data.profile?.subteam_id;
		const candidates = availableNow.slice().sort((a, b) => {
			const ap = preferredTeam && a.subteam_id === preferredTeam ? 0 : 1;
			const bp = preferredTeam && b.subteam_id === preferredTeam ? 0 : 1;
			if (ap !== bp) return ap - bp;
			return byPriority(a, b);
		});
		return candidates[0] ?? null;
	});

	const statusPillClass = (status: string) => {
		switch (status) {
			case 'completed':
				return 'bg-emerald-900/40 text-emerald-200';
			case 'mentor_checkoff_pending':
				return 'bg-sky-900/40 text-sky-200';
			case 'checkoff_needs_review':
				return 'bg-amber-900/40 text-amber-200';
			case 'checkoff_blocked':
				return 'bg-red-900/40 text-red-200';
			case 'quiz_pending':
				return 'bg-yellow-900/40 text-yellow-200';
			case 'video_pending':
				return 'bg-slate-700 text-slate-100';
			case 'available':
				return 'bg-slate-800 text-slate-100';
			default:
				return 'bg-slate-800 text-slate-400';
		}
	};

	const statusLabel = (status: string) =>
		({
			locked: 'Locked',
			available: 'Ready',
			video_pending: 'In video',
			quiz_pending: 'Quiz open',
			mentor_checkoff_pending: 'Awaiting mentor',
			checkoff_needs_review: 'Redo checkoff',
			checkoff_blocked: 'Blocked',
			completed: 'Completed'
		})[status] ?? status;
</script>

<section class="space-y-6">
	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-semibold">Dashboard</h1>
				<p class="text-slate-300">
					Welcome {data.profile?.full_name || data.profile?.email || 'teammate'}.
				</p>
			</div>
			<a href="/teams" class="inline-flex rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
				>Manage teams</a
			>
		</div>
		<div class="mt-4 grid grid-cols-2 gap-2 text-center md:grid-cols-4">
			<div class="rounded border border-slate-800 bg-slate-950/60 p-2">
				<p class="text-xs text-slate-400">Total</p>
				<p class="text-lg font-semibold">{summary.total}</p>
			</div>
			<div class="rounded border border-emerald-800/60 bg-emerald-900/20 p-2">
				<p class="text-xs text-emerald-300">Completed</p>
				<p class="text-lg font-semibold text-emerald-200">{summary.completed}</p>
			</div>
			<div class="rounded border border-yellow-800/60 bg-yellow-900/20 p-2">
				<p class="text-xs text-yellow-300">In progress</p>
				<p class="text-lg font-semibold text-yellow-200">{summary.inProgress}</p>
			</div>
			<div class="rounded border border-slate-800 bg-slate-950/60 p-2">
				<p class="text-xs text-slate-400">Locked</p>
				<p class="text-lg font-semibold">{summary.locked}</p>
			</div>
		</div>
	</div>

	<div class="grid gap-3 md:grid-cols-3">
		<div class="rounded-xl border border-yellow-700/40 bg-yellow-900/20 p-4 md:col-span-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-yellow-300">Next action</p>
			{#if redoCheckoff.length > 0}
				<h2 class="mt-1 text-lg font-semibold">Action required: redo checkoff</h2>
				<p class="text-sm text-yellow-100">
					You have {redoCheckoff.length} course{redoCheckoff.length === 1 ? '' : 's'} needing checkoff updates.
				</p>
				<a
					href={`/learn/${redoCheckoff[0].slug}`}
					class="mt-3 inline-flex rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-slate-900"
					>Fix first checkoff</a
				>
			{:else if blockedCheckoff.length > 0}
				<h2 class="mt-1 text-lg font-semibold">Blocked checkoff</h2>
				<p class="text-sm text-yellow-100">Resolve mentor safety/compliance feedback before continuing.</p>
				<a
					href={`/learn/${blockedCheckoff[0].slug}`}
					class="mt-3 inline-flex rounded border border-yellow-300 px-3 py-2 text-sm"
					>View blocked details</a
				>
			{:else if recommendedNext}
				<h2 class="mt-1 text-lg font-semibold">{recommendedNext.title}</h2>
				<p class="text-sm text-yellow-100">Highest-impact available course for progression.</p>
				<a
					href={`/learn/${recommendedNext.slug}`}
					class="mt-3 inline-flex rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-slate-900"
					>Start course</a
				>
			{:else if awaitingMentor.length > 0}
				<h2 class="mt-1 text-lg font-semibold">Waiting on mentor signoff</h2>
				<p class="text-sm text-yellow-100">
					You have {awaitingMentor.length} course{awaitingMentor.length === 1 ? '' : 's'} ready for review.
				</p>
			{:else}
				<h2 class="mt-1 text-lg font-semibold">No takeable courses right now</h2>
				<p class="text-sm text-yellow-100">Check locked courses below and complete prerequisites.</p>
			{/if}
		</div>
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">At a glance</p>
			<ul class="mt-2 space-y-1 text-sm text-slate-300">
				<li>{availableNow.length} ready to work on</li>
				<li>{redoCheckoff.length} need checkoff redo</li>
				<li>{blockedCheckoff.length} blocked</li>
				<li>{awaitingMentor.length} awaiting mentor</li>
				<li>{summary.completed} completed total</li>
			</ul>
		</div>
	</div>

	<div class="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="mr-auto text-lg font-semibold">Course Catalog</h2>
			<input
				bind:value={filter}
				placeholder="Search courses..."
				class="w-full rounded bg-slate-800 px-2 py-2 text-sm md:w-64"
			/>
			<label class="flex items-center gap-2 text-xs text-slate-300">
				<input type="checkbox" bind:checked={onlyUnfinished} class="accent-yellow-400" />
				Hide completed
			</label>
		</div>

		{#if filtered.length === 0}
			<p class="text-sm text-slate-400">No courses match your filter.</p>
		{/if}

		{#if primaryTeamId}
			<div class="space-y-3">
				<div class="rounded border border-slate-800 bg-slate-950/30 p-3">
					<div class="mb-2 flex items-center justify-between">
						<p class="text-sm font-semibold text-emerald-200">Takeable now (your team)</p>
						<p class="text-xs text-slate-400">Highest prerequisite impact first</p>
					</div>
					<p class="mb-2 text-xs text-slate-400">
						Start here first to unlock the largest number of downstream courses.
					</p>
					<div class="grid gap-2">
						{#each takeablePrimary as node (node.id)}
							{@const status = effectiveStatusFor(node.id)}
							<a
								href={`/learn/${node.slug}`}
								class="flex items-center justify-between rounded border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-sm transition hover:border-emerald-700 hover:bg-emerald-900/20"
							>
								<span class="font-medium">{node.title}</span>
								<div class="flex items-center gap-2">
									<span class="text-[11px] text-slate-400">unlocks {prereqDependentsCount.get(node.id) ?? 0}</span>
									<span class={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(status)}`}>
										{statusLabel(status)}
									</span>
								</div>
							</a>
						{:else}
							<p class="text-sm text-slate-400">No takeable team courses right now.</p>
						{/each}
					</div>
				</div>

				<div class="rounded border border-slate-800 bg-slate-950/30 p-3">
					<p class="mb-2 text-sm font-semibold text-slate-200">In progress / mentor stage</p>
					<p class="mb-2 text-xs text-slate-400">
						Continue these to clear pending review and finish active work.
					</p>
					<div class="grid gap-2">
						{#each inProgressPrimary as node (node.id)}
							{@const status = effectiveStatusFor(node.id)}
							<a
								href={`/learn/${node.slug}`}
								class="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm transition hover:border-slate-700 hover:bg-slate-800/60"
							>
								<span class="font-medium">{node.title}</span>
								<span class={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(status)}`}>
									{statusLabel(status)}
								</span>
							</a>
						{:else}
							<p class="text-sm text-slate-400">No in-progress team courses.</p>
						{/each}
					</div>
				</div>

				<div class="rounded border border-slate-800 bg-slate-950/30 p-3">
					<p class="mb-2 text-sm font-semibold text-slate-300">Locked (your team)</p>
					<p class="mb-2 text-xs text-slate-400">
						Complete prerequisites from the sections above to open these.
					</p>
					<div class="grid gap-2">
						{#each lockedPrimary as node (node.id)}
							{@const status = effectiveStatusFor(node.id)}
							<a
								href={`/learn/${node.slug}`}
								class="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm transition hover:border-slate-700 hover:bg-slate-800/60"
							>
								<span class="font-medium">{node.title}</span>
								<span class={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(status)}`}>
									{statusLabel(status)}
								</span>
							</a>
						{:else}
							<p class="text-sm text-slate-400">No locked team courses.</p>
						{/each}
					</div>
				</div>

				<div class="rounded border border-slate-800 bg-slate-950/30 p-3">
					<button
						type="button"
						class="flex w-full items-center justify-between text-left"
						onclick={() => (showCompletedCourses = !showCompletedCourses)}
					>
						<span class="text-sm font-semibold text-slate-200">
							Completed courses ({completedPrimary.length})
						</span>
						<span class="text-xs text-slate-400">{showCompletedCourses ? 'Hide' : 'Show'}</span>
					</button>
					{#if showCompletedCourses}
						<div class="mt-3 grid gap-2">
							{#each completedPrimary as node (node.id)}
								{@const status = effectiveStatusFor(node.id)}
								<a
									href={`/learn/${node.slug}`}
									class="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm transition hover:border-slate-700 hover:bg-slate-800/60"
								>
									<span class="font-medium">{node.title}</span>
									<span class={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(status)}`}>
										{statusLabel(status)}
									</span>
								</a>
							{:else}
								<p class="text-sm text-slate-400">No completed team courses yet.</p>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="rounded border border-slate-800 bg-slate-950/30 p-3">
				<button
					type="button"
					class="flex w-full items-center justify-between text-left"
					onclick={() => (showOtherCourses = !showOtherCourses)}
				>
					<span class="text-sm font-semibold text-slate-200">Other courses ({otherNodes.length})</span>
					<span class="text-xs text-slate-400">{showOtherCourses ? 'Hide' : 'Show'}</span>
				</button>
				{#if showOtherCourses}
					<div class="mt-3 space-y-3">
						<div>
							<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
								Takeable outside your team
							</p>
							<div class="grid gap-2">
								{#each otherTakeable as node (node.id)}
									{@const status = effectiveStatusFor(node.id)}
									<a
										href={`/learn/${node.slug}`}
										class="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm transition hover:border-slate-700 hover:bg-slate-800/60"
									>
										<span class="font-medium">{node.title}</span>
										<span class={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(status)}`}>
											{statusLabel(status)}
										</span>
									</a>
								{:else}
									<p class="text-sm text-slate-400">No takeable outside-team courses.</p>
								{/each}
							</div>
						</div>
						<div>
							<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
								Other remaining courses
							</p>
							<div class="grid gap-2">
								{#each otherRemaining as node (node.id)}
									{@const status = effectiveStatusFor(node.id)}
									<a
										href={`/learn/${node.slug}`}
										class="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm transition hover:border-slate-700 hover:bg-slate-800/60"
									>
										<span class="font-medium">{node.title}</span>
										<span class={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(status)}`}>
											{statusLabel(status)}
										</span>
									</a>
								{:else}
									<p class="text-sm text-slate-400">No additional courses.</p>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-slate-400">
				No primary team selected. Choose a team in <a class="underline" href="/teams">Teams</a> for a focused catalog view.
			</p>
		{/if}
	</div>
</section>
