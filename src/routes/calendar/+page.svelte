<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import { isAdmin, isLead, isMentor, roleBadgeParts } from '$lib/roles';

	let { data } = $props();

	const mineSet = $derived(new Set<string>(data.mine));
	const roster = $derived(data.roster);
	const rosterMap = $derived(new Map(roster.map((r) => [r.id, r])));
	const subteamMap = $derived(new Map(data.subteams.map((s) => [s.id, s])));

	const shifts: { n: 1 | 2; label: string; hint: string }[] = [
		{ n: 1, label: 'Shift 1', hint: 'First half' },
		{ n: 2, label: 'Shift 2', hint: 'Second half' }
	];

	const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const calendarRows = $derived.by(() => {
		const rows: (string | null)[][] = [];
		if (!data.dates.length) return rows;
		let row: (string | null)[] = Array(7).fill(null);
		let cursor = 0;
		for (const iso of data.dates as string[]) {
			const day = new Date(iso + 'T00:00:00').getDay();
			if (rows.length === 0 && cursor === 0 && day > 0) {
				// Leave leading blanks so calendar always starts with Sun column.
				for (let i = 0; i < day; i++) row[i] = null;
				cursor = day;
			}
			if (day < cursor) {
				rows.push(row);
				row = Array(7).fill(null);
			}
			row[day] = iso;
			cursor = day + 1;
		}
		rows.push(row);
		return rows;
	});

	const fmt = (iso: string) => {
		const d = new Date(iso + 'T00:00:00');
		return {
			weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
			day: d.getDate(),
			month: d.toLocaleDateString(undefined, { month: 'short' }),
			isToday: iso === new Date().toISOString().slice(0, 10),
			isWeekend: [0, 6].includes(d.getDay())
		};
	};

	const setScope = (scope: 'me' | 'team' | 'all') => {
		const url = new URL(window.location.href);
		url.searchParams.set('scope', scope);
		window.location.href = url.toString();
	};

	let selectedShift = $state<{
		key: string;
		date: string;
		shift: 1 | 2;
		userIds: string[];
	} | null>(null);

	const toggle = async (date: string, shift: 1 | 2, currentlyAvailable: boolean) => {
		const fd = new FormData();
		fd.set('date', date);
		fd.set('shift', String(shift));
		fd.set('available', String(!currentlyAvailable));
		await fetch('?/toggle', { method: 'POST', body: fd });
		await invalidateAll();
	};

	const openShift = (date: string, shift: 1 | 2) => {
		if (data.scope !== 'all') return;
		const key = `${date}|${shift}`;
		selectedShift = { key, date, shift, userIds: (data.rosterByKey[key] ?? []) as string[] };
	};

	const closeShift = () => {
		selectedShift = null;
	};

	const groupedSelectedShiftUsers = $derived.by(() => {
		if (!selectedShift) return [];
		type Group = { key: string; label: string; users: any[] };
		const groups: Group[] = [
			{ key: 'admin', label: 'Admin', users: [] },
			{ key: 'member', label: 'Member', users: [] }
		];
		const byKey = new Map(groups.map((g) => [g.key, g]));
		for (const uid of selectedShift.userIds) {
			const p = rosterMap.get(uid);
			if (!p) continue;
			const key = p.base_role === 'admin' ? 'admin' : 'member';
			byKey.get(key)?.users.push(p);
		}
		return groups.filter((g) => g.users.length > 0);
	});
</script>

<section class="space-y-6">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Calendar</p>
			<h1 class="mt-1 text-3xl font-semibold tracking-tight">Shop availability</h1>
			<p class="mt-2 max-w-2xl text-sm text-slate-400">
				Mark the shifts you can be at the shop for the next two weeks. Each day has two shifts.
				{#if data.canTeam}Mentors and student leads can see team availability.{/if}
				{#if data.canAll} Admins see everyone.{/if}
			</p>
		</div>

		<div class="inline-flex overflow-hidden rounded-md border border-slate-600 bg-slate-900 text-sm shadow-sm">
			<button
				type="button"
				class={`px-3 py-1.5 ${data.scope === 'me' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
				onclick={() => setScope('me')}>Me</button
			>
			{#if data.canTeam}
				<button
					type="button"
					class={`border-l border-slate-600 px-3 py-1.5 ${data.scope === 'team' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
					onclick={() => setScope('team')}>My team</button
				>
			{/if}
			{#if data.canAll}
				<button
					type="button"
					class={`border-l border-slate-600 px-3 py-1.5 ${data.scope === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
					onclick={() => setScope('all')}>All</button
				>
			{/if}
		</div>
	</header>

	{#if data.scope === 'me'}
		<div class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
			<div class="grid grid-cols-7 border-b border-slate-700 bg-slate-800/70 text-[11px] font-medium uppercase tracking-wider text-slate-300">
				{#each weekdayLabels as day (day)}
					<div class="px-3 py-2 text-center">{day}</div>
				{/each}
			</div>
			<div class="space-y-0">
				{#each calendarRows as row, ri (ri)}
					<div class="grid grid-cols-7 divide-x divide-slate-700 border-b border-slate-800 last:border-b-0">
						{#each row as iso, ci (`${ri}-${ci}`)}
							<div class={`min-h-[126px] p-2 ${ci === 0 || ci === 6 ? 'bg-slate-900/40' : ''}`}>
								{#if iso}
									{@const m = fmt(iso)}
									<div class="mb-1 flex items-baseline justify-between">
										<span class="text-[11px] text-slate-400">{m.month}</span>
										<span class={m.isToday ? 'rounded bg-slate-700 px-1.5 py-0.5 text-xs text-white' : 'text-xs text-slate-300'}>
											{m.day}
										</span>
									</div>
									<div class="flex flex-col gap-1">
										{#each shifts as shift (shift.n)}
											{@const key = `${iso}|${shift.n}`}
											{@const on = mineSet.has(key)}
											<button
												type="button"
												onclick={() => toggle(iso, shift.n, on)}
												class={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
													on
														? 'border-slate-600 bg-slate-700 text-white'
														: 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
												}`}
											>
												<span class="block font-medium">{shift.label}</span>
												<span class={`block text-[10px] ${on ? 'text-white/70' : 'text-slate-500'}`}>
													{on ? 'Available' : 'Tap to opt in'}
												</span>
											</button>
										{/each}
									</div>
								{/if}
								{#if !iso}
									<div class="flex h-full min-h-[110px] items-center justify-center rounded-md border border-dashed border-slate-800 bg-slate-900/20">
										<span class="text-base font-light text-slate-700">×</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="space-y-4">
			<div class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
				<div class="grid grid-cols-7 border-b border-slate-700 bg-slate-800/70 text-[11px] font-medium uppercase tracking-wider text-slate-300">
					{#each weekdayLabels as day (day)}
						<div class="px-3 py-2 text-center">{day}</div>
					{/each}
				</div>
				<div class="space-y-0">
					{#each calendarRows as row, ri (ri)}
						<div class="grid grid-cols-7 divide-x divide-slate-700 border-b border-slate-800 last:border-b-0">
							{#each row as iso, ci (`${ri}-${ci}`)}
								<div class={`min-h-[154px] p-2 ${ci === 0 || ci === 6 ? 'bg-slate-900/40' : ''}`}>
									{#if iso}
										{@const m = fmt(iso)}
										<div class="mb-1 flex items-baseline justify-between">
											<span class="text-[11px] text-slate-400">{m.month}</span>
											<span class={m.isToday ? 'rounded bg-slate-700 px-1.5 py-0.5 text-xs text-white' : 'text-xs text-slate-300'}>
												{m.day}
											</span>
										</div>
										<div class="space-y-2">
											{#each shifts as shift (shift.n)}
												{@const key = `${iso}|${shift.n}`}
												{@const ids = data.rosterByKey[key] ?? []}
												{@const mineOn = mineSet.has(key)}
												<div class="w-full rounded-md border border-slate-700 bg-slate-800/40 p-2 text-left">
													<div class="flex items-center justify-between">
														<p class="text-[11px] font-medium uppercase tracking-wider text-slate-400">
															{shift.label}
														</p>
														<span class="text-[11px] font-medium text-slate-100">{ids.length}</span>
													</div>
													{#if ids.length === 0}
														<p class="mt-1.5 text-[11px] text-slate-500">—</p>
													{:else}
														<div class="mt-1.5 flex flex-wrap gap-1">
															{#each ids.slice(0, 8) as uid (uid)}
																{@const p = rosterMap.get(uid)}
																{#if p}
																	<Avatar
																		name={p.full_name}
																		email={p.email}
																		url={p.avatar_url}
																		size="xs"
																		ring={isMentor(p)}
																		ringClass="ring-sky-400"
																		title={p.full_name || p.email}
																	/>
																{/if}
															{/each}
															{#if ids.length > 8}
																<span class="text-[11px] text-slate-400">+{ids.length - 8}</span>
															{/if}
														</div>
													{/if}
													<div class="mt-2 flex gap-1">
														{#if data.scope === 'all'}
															<button
																type="button"
																class="flex-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
																onclick={() => openShift(iso, shift.n)}
															>
																View list
															</button>
														{/if}
														<button
															type="button"
															class="flex-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
															onclick={() => toggle(iso, shift.n, mineOn)}
														>
															{mineOn ? 'Leave' : 'Add me'}
														</button>
													</div>
												</div>
											{/each}
										</div>
									{/if}
									{#if !iso}
										<div class="flex h-full min-h-[138px] items-center justify-center rounded-md border border-dashed border-slate-800 bg-slate-900/20">
											<span class="text-base font-light text-slate-700">×</span>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			{#if data.scope === 'all' && roster.length > 0}
				<div class="rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
					<p class="text-sm font-medium">Roster ({roster.length})</p>
					<p class="text-xs text-slate-400">Everyone visible to admins.</p>
					<ul class="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
						{#each roster as p (p.id)}
							<li class="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/30 p-2">
								<Avatar
									name={p.full_name}
									email={p.email}
									url={p.avatar_url}
									size="sm"
									ring={isMentor(p)}
									ringClass="ring-sky-400"
								/>
								<div class="min-w-0 text-xs">
									<p class="truncate font-medium text-slate-100">{p.full_name || p.email}</p>
									<p class="truncate text-slate-400">
										{roleBadgeParts(p).join(' · ')} · {subteamMap.get(p.subteam_id ?? '')?.name ?? 'No team'}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	{#if selectedShift}
		<div
			class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
			role="button"
			tabindex="0"
			onclick={closeShift}
			onkeydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') closeShift();
			}}
		>
			<div
				class="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-4"
				role="dialog"
				aria-modal="true"
				tabindex="0"
				onclick={(event) => event.stopPropagation()}
				onkeydown={(event) => {
					if (event.key === 'Escape') closeShift();
				}}
			>
				<div class="mb-3 flex items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase tracking-wide text-slate-400">Shift detail</p>
						<p class="text-lg font-semibold">
							{fmt(selectedShift.date).weekday}, {fmt(selectedShift.date).month} {fmt(selectedShift.date).day} ·
							Shift {selectedShift.shift}
						</p>
						<p class="text-xs text-slate-400">{selectedShift.userIds.length} available</p>
					</div>
					<button
						type="button"
						class="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
						onclick={closeShift}
					>
						Close
					</button>
				</div>
				{#if selectedShift.userIds.length === 0}
					<p class="text-sm text-slate-400">Nobody marked available for this shift.</p>
				{:else}
					<div class="space-y-4">
						{#each groupedSelectedShiftUsers as group (group.key)}
							<div>
								<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
								<ul class="grid gap-2 sm:grid-cols-2">
									{#each group.users as p (p.id)}
										<li class="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/40 p-2">
											<Avatar
												name={p.full_name}
												email={p.email}
												url={p.avatar_url}
												size="sm"
												ring={isMentor(p)}
												ringClass="ring-sky-400"
											/>
											<div class="min-w-0 text-xs">
												<p class="truncate font-medium text-slate-100">{p.full_name || p.email}</p>
												<p class="truncate text-slate-400">
													{roleBadgeParts(p).join(' · ')} · {subteamMap.get(p.subteam_id ?? '')?.name ?? 'No team'}
												</p>
											</div>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>
