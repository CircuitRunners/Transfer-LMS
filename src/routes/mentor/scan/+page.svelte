<script lang="ts">
	import QRScanner from '$lib/components/QRScanner.svelte';
	let result = $state<any>(null);
	let error = $state('');

	const onDecoded = async (token: string) => {
		const res = await fetch('/api/mentor/resolve-qr', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Failed to decode QR';
			return;
		}
		result = data;
		error = '';
	};
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">QR Scanner</h1>
	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<QRScanner {onDecoded} />
	</div>
	{#if error}<p class="text-red-300">{error}</p>{/if}
	{#if result}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
			<p class="font-semibold">{result.profile?.full_name || result.profile?.email}</p>
			<ul class="mt-2 list-disc pl-5 text-sm text-slate-300">
				{#each result.certifications ?? [] as cert}
					<li>{cert.nodes?.title}</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
