<script lang="ts">
	import { isMentor } from '$lib/roles';
	let { data, form } = $props();
	const canMentor = $derived(isMentor(data.profile));

	const message = $derived.by(() => {
		if (form?.error) return { tone: 'error' as const, text: form.error };
		if (form?.ok && form?.section === 'primary')
			return { tone: 'ok' as const, text: 'Primary team updated.' };
		if (form?.ok && form?.section === 'mentor')
			return { tone: 'ok' as const, text: 'Mentor checkoff teams updated.' };
		return null;
	});
</script>

<section class="space-y-6">
	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h1 class="text-2xl font-semibold">Teams</h1>
		<p class="text-sm text-slate-300">
			Set your primary team for course organization and (for mentors) choose the teams you want to
			check off.
		</p>
	</div>

	{#if message}
		<div
			class={`rounded border p-3 text-sm ${
				message.tone === 'error'
					? 'border-red-700 bg-red-900/30 text-red-200'
					: 'border-emerald-700 bg-emerald-900/30 text-emerald-200'
			}`}
		>
			{message.text}
		</div>
	{/if}

	<form
		method="POST"
		action="?/setPrimaryTeam"
		class="rounded-xl border border-slate-800 bg-slate-900 p-4"
	>
		<h2 class="text-lg font-semibold">Primary team</h2>
		<p class="mb-3 text-xs text-slate-400">
			This drives your default course grouping and teammate context.
		</p>
		<div class="grid gap-2 md:grid-cols-2">
			{#each data.subteams as team}
				<label class="flex cursor-pointer items-center gap-2 rounded border border-slate-800 p-3 hover:bg-slate-800">
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
			<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900" type="submit"
				>Save primary team</button
			>
			<button class="rounded border border-slate-800 px-4 py-2 text-sm" type="submit" name="subteam_id" value=""
				>Clear</button
			>
		</div>
	</form>

	{#if canMentor}
		<form
			method="POST"
			action="?/saveMentorTeams"
			class="rounded-xl border border-slate-800 bg-slate-900 p-4"
		>
			<h2 class="text-lg font-semibold">Mentor checkoff teams</h2>
			<p class="mb-3 text-xs text-slate-400">
				Pick which teams should appear in your mentor queue when filtering to "My teams".
			</p>
			<div class="grid gap-2 md:grid-cols-2">
				{#each data.subteams as team}
					<label class="flex cursor-pointer items-center gap-2 rounded border border-slate-800 p-3 hover:bg-slate-800">
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
			<button class="mt-3 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900" type="submit"
				>Save mentor teams</button
			>
		</form>
	{/if}
</section>
