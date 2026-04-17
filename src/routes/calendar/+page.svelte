<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';

	let { data } = $props();

	const mineSet = $derived(new Set<string>(data.mine));
	const roster = $derived(data.roster);
	const rosterMap = $derived(new Map(roster.map((r) => [r.id, r])));
	const subteamMap = $derived(new Map(data.subteams.map((s) => [s.id, s])));

	const shifts: { n: 1 | 2; label: string; hint: string }[] = [
		{ n: 1, label: 'Shift 1', hint: 'First half' },
		{ n: 2, label: 'Shift 2', hint: 'Second half' }
	];

	const weeks = $derived.by(() => {
		const out: string[][] = [];
		for (let i = 0; i < data.dates.length; i += 7) out.push(data.dates.slice(i, i + 7));
		return out;
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

	const toggle = async (date: string, shift: 1 | 2, currentlyAvailable: boolean) => {
		const fd = new FormData();
		fd.set('date', date);
		fd.set('shift', String(shift));
		fd.set('available', String(!currentlyAvailable));
		await fetch('?/toggle', { method: 'POST', body: fd });
		await invalidateAll();
	};
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
		<div class="space-y-4">
			{#each weeks as week, wi (wi)}
				<div class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
					<div class="grid grid-cols-7 border-b border-slate-700 bg-slate-800/70 text-[11px] font-medium uppercase tracking-wider text-slate-300">
						{#each week as iso (iso)}
							{@const m = fmt(iso)}
							<div class="flex items-baseline justify-between px-3 py-2">
								<span>{m.weekday}</span>
								<span class={m.isToday ? 'rounded bg-slate-700 px-1.5 py-0.5 text-white' : ''}>
									{m.month} {m.day}
								</span>
							</div>
						{/each}
					</div>
					<div class="grid grid-cols-7 divide-x divide-slate-700">
						{#each week as iso (iso)}
							<div class="flex flex-col gap-1 p-2">
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
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="space-y-4">
			{#each weeks as week, wi (wi)}
				<div class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
					<div class="grid grid-cols-7 border-b border-slate-700 bg-slate-800/70 text-[11px] font-medium uppercase tracking-wider text-slate-300">
						{#each week as iso (iso)}
							{@const m = fmt(iso)}
							<div class="flex items-baseline justify-between px-3 py-2">
								<span>{m.weekday}</span>
								<span class={m.isToday ? 'rounded bg-slate-700 px-1.5 py-0.5 text-white' : ''}>
									{m.month} {m.day}
								</span>
							</div>
						{/each}
					</div>
					<div class="grid grid-cols-7 divide-x divide-slate-700">
						{#each week as iso (iso)}
							<div class="space-y-2 p-2">
								{#each shifts as shift (shift.n)}
									{@const key = `${iso}|${shift.n}`}
									{@const ids = data.rosterByKey[key] ?? []}
									{@const mineOn = mineSet.has(key)}
									<div class="rounded-md border border-slate-700 bg-slate-800/40 p-2">
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
															title={p.full_name || p.email}
														/>
													{/if}
												{/each}
												{#if ids.length > 8}
													<span class="text-[11px] text-slate-400">+{ids.length - 8}</span>
												{/if}
											</div>
										{/if}
										<button
											type="button"
											class="mt-2 w-full rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
											onclick={() => toggle(iso, shift.n, mineOn)}
										>
											{mineOn ? 'Leave' : 'Add me'}
										</button>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/each}

			{#if data.scope === 'all' && roster.length > 0}
				<div class="rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
					<p class="text-sm font-medium">Roster ({roster.length})</p>
					<p class="text-xs text-slate-400">Everyone visible to admins.</p>
					<ul class="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
						{#each roster as p (p.id)}
							<li class="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/30 p-2">
								<Avatar name={p.full_name} email={p.email} url={p.avatar_url} size="sm" />
								<div class="min-w-0 text-xs">
									<p class="truncate font-medium text-slate-100">{p.full_name || p.email}</p>
									<p class="truncate text-slate-400">
										{p.role} · {subteamMap.get(p.subteam_id ?? '')?.name ?? 'No team'}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</section>
