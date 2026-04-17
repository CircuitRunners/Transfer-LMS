<script lang="ts">
	import PassportQR from '$lib/components/PassportQR.svelte';
	let { data } = $props();
	const specialTitles = $derived((data.specialTitles ?? []) as string[]);
	const trackRanks = $derived((data.trackRanks ?? []) as any[]);
</script>

<section class="grid gap-4 md:grid-cols-2">
	<div class="rounded-xl border border-neutral-200 bg-white p-4">
		<h1 class="text-2xl font-semibold">Digital Passport</h1>
		<p class="text-neutral-700">{data.profile?.full_name || data.profile?.email}</p>
		<p class="mt-2 rounded bg-neutral-100 px-2 py-1 text-sm">{data.progressSummary}</p>
		<p class="mt-2 text-sm text-yellow-300">Overall rank: {data.overallRank}</p>
		{#if specialTitles.length > 0}
			<p class="mt-1 text-xs text-emerald-800">Special: {specialTitles.join(' · ')}</p>
		{/if}
		<div class="mt-3 rounded bg-neutral-50 p-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Track rank tiers</p>
			<ul class="mt-1 space-y-1 text-sm text-neutral-700">
				{#each trackRanks as rank}
					<li>{rank.trackName}: {rank.tier} ({rank.count} completed)</li>
				{:else}
					<li class="text-neutral-500">Complete courses to earn track tiers.</li>
				{/each}
			</ul>
		</div>
		<h2 class="mt-4 font-semibold">Badges</h2>
		<ul class="mt-2 list-disc pl-5 text-sm text-neutral-700">
			{#each data.badges as badge}
				<li>{badge}</li>
			{/each}
		</ul>
	</div>
	<div class="rounded-xl border border-neutral-200 bg-white p-4">
		<h2 class="mb-3 text-lg font-semibold">QR Identity</h2>
		<PassportQR qrDataUrl={data.qrDataUrl} />
	</div>
</section>
