<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import PassportQR from '$lib/components/PassportQR.svelte';
	import { isMentor, roleBadgeParts } from '$lib/roles';

	let { data, form } = $props();
	const canMentor = $derived(isMentor(data.profile));
	const roleLabel = $derived(roleBadgeParts(data.profile).join(' · '));
	const specialTitles = $derived((data.specialTitles ?? []) as string[]);
	const trackRanks = $derived((data.trackRanks ?? []) as any[]);
	const successText = $derived.by(() => {
		if (!form?.ok) return '';
		if (form?.section === 'primary') return 'Primary team updated.';
		if (form?.section === 'mentor') return 'Mentor checkoff teams updated.';
		return 'Profile updated.';
	});

	let fullName = $state('');
	let bio = $state('');
	let avatarUrl = $state('');
	$effect(() => {
		fullName = data.profile?.full_name ?? '';
		bio = data.profile?.bio ?? '';
		avatarUrl = data.profile?.avatar_url ?? '';
	});
</script>

<section class="mx-auto max-w-3xl space-y-6">
	<header>
		<p class="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Profile</p>
		<h1 class="mt-1 text-3xl font-semibold tracking-tight">Your profile</h1>
		<p class="mt-2 text-sm text-slate-400">
			How teammates and mentors see you across Transfer.
		</p>
	</header>

	{#if form?.error}
		<div class="rounded-md border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">{form.error}</div>
	{/if}
	{#if form?.ok}
		<div class="rounded-md border border-emerald-700 bg-emerald-900/30 p-3 text-sm text-emerald-200">
			{successText}
		</div>
	{/if}

	<div class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
		<div class="flex items-center gap-4 border-b border-slate-700 bg-slate-800/60 px-5 py-4">
			<Avatar
				name={fullName || data.profile?.email}
				email={data.profile?.email}
				url={avatarUrl}
				size="xl"
			/>
			<div class="min-w-0">
				<p class="truncate text-base font-semibold">{fullName || data.profile?.email}</p>
				<p class="truncate text-xs uppercase tracking-wider text-slate-400">
					{roleLabel}
				</p>
				<p class="mt-1 truncate text-xs text-slate-400">{data.profile?.email}</p>
			</div>
		</div>

		<form method="POST" action="?/save" class="space-y-4 p-5">
			<label class="block space-y-1">
				<span class="text-xs font-medium uppercase tracking-wider text-slate-400">
					Display name
				</span>
				<input
					name="full_name"
					required
					bind:value={fullName}
					class="block w-full rounded-md border border-slate-600 bg-slate-800/40 px-3 py-2 text-sm"
					placeholder="Your name"
				/>
			</label>

			<label class="block space-y-1">
				<span class="text-xs font-medium uppercase tracking-wider text-slate-400">
					Avatar URL
				</span>
				<input
					name="avatar_url"
					bind:value={avatarUrl}
					type="url"
					class="block w-full rounded-md border border-slate-600 bg-slate-800/40 px-3 py-2 text-sm"
					placeholder="https://…"
				/>
				<span class="text-[11px] text-slate-400">
					Optional. Leave blank to use initials. Square images look best.
				</span>
			</label>

			<label class="block space-y-1">
				<span class="text-xs font-medium uppercase tracking-wider text-slate-400">Bio</span>
				<textarea
					name="bio"
					rows="4"
					maxlength="500"
					bind:value={bio}
					class="block w-full rounded-md border border-slate-600 bg-slate-800/40 px-3 py-2 text-sm"
					placeholder="A short intro, interests, or what you're focusing on this season."
				></textarea>
			</label>

			<div class="flex justify-end">
				<button
					class="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
				>
					Save profile
				</button>
			</div>
		</form>
	</div>

	<div class="rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
		<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Teams</p>
		<form method="POST" action="?/setPrimaryTeam" class="mt-3">
			<p class="mb-2 text-sm font-medium">Primary team</p>
			<div class="grid gap-2 md:grid-cols-2">
				{#each data.subteams as team}
					<label class="flex cursor-pointer items-center gap-2 rounded border border-slate-700 p-3 hover:bg-slate-800/60">
						<input
							type="radio"
							name="subteam_id"
							value={team.id}
							checked={data.profile?.subteam_id === team.id}
							class="accent-yellow-400"
						/>
						<div>
							<p class="font-medium">{team.name}</p>
							<p class="text-xs text-slate-500">{team.slug}</p>
						</div>
					</label>
				{/each}
			</div>
			<div class="mt-3 flex gap-2">
				<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900" type="submit">
					Save primary team
				</button>
				<button class="rounded border border-slate-700 px-4 py-2 text-sm" type="submit" name="subteam_id" value="">
					Clear
				</button>
			</div>
		</form>
		{#if canMentor}
			<form method="POST" action="?/saveMentorTeams" class="mt-5 border-t border-slate-700 pt-4">
				<p class="mb-2 text-sm font-medium">Mentor checkoff teams</p>
				<div class="grid gap-2 md:grid-cols-2">
					{#each data.subteams as team}
						<label class="flex cursor-pointer items-center gap-2 rounded border border-slate-700 p-3 hover:bg-slate-800/60">
							<input
								type="checkbox"
								name="mentor_team_ids"
								value={team.id}
								checked={data.mentorTeamIds.includes(team.id)}
								class="accent-yellow-400"
							/>
							<div>
								<p class="font-medium">{team.name}</p>
								<p class="text-xs text-slate-500">{team.slug}</p>
							</div>
						</label>
					{/each}
				</div>
				<button class="mt-3 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900" type="submit">
					Save mentor teams
				</button>
			</form>
		{/if}
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="rounded-xl border border-slate-700 bg-slate-900 p-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Digital passport</p>
			<p class="mt-2 text-slate-300">{data.profile?.full_name || data.profile?.email}</p>
			<p class="mt-2 rounded bg-slate-800 px-2 py-1 text-sm">{data.progressSummary}</p>
			<p class="mt-2 text-sm text-yellow-300">Overall rank: {data.overallRank}</p>
			{#if specialTitles.length > 0}
				<p class="mt-1 text-xs text-emerald-200">Special: {specialTitles.join(' · ')}</p>
			{/if}
			<div class="mt-3 rounded bg-slate-900/50 p-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Track rank tiers</p>
				<ul class="mt-1 space-y-1 text-sm text-slate-300">
					{#each trackRanks as rank}
						<li>{rank.trackName}: {rank.tier} ({rank.count} completed)</li>
					{:else}
						<li class="text-slate-400">Complete courses to earn track tiers.</li>
					{/each}
				</ul>
			</div>
			<h2 class="mt-4 font-semibold">Badges</h2>
			<ul class="mt-2 list-disc pl-5 text-sm text-slate-300">
				{#each data.badges as badge}
					<li>{badge}</li>
				{/each}
			</ul>
		</div>
		<div class="rounded-xl border border-slate-700 bg-slate-900 p-4">
			<h2 class="mb-3 text-lg font-semibold">QR Identity</h2>
			<PassportQR qrDataUrl={data.qrDataUrl} />
		</div>
	</div>
</section>
