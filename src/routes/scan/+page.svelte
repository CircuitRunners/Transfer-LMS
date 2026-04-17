<script lang="ts">
	import QRScanner from '$lib/components/QRScanner.svelte';
	let { data } = $props();
	let token = $state(data.machineToken ?? '');
	let error = $state('');
	let success = $state('');
	let machine = $state<any>(null);

	const useMachine = async () => {
		if (!token.trim()) {
			error = 'Scan or enter a QR token first.';
			return;
		}
		const res = await fetch('/api/machines/use', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ machineToken: token.trim() })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Authorization failed.';
			success = '';
			machine = body?.machine ?? null;
			return;
		}
		error = '';
		success = body?.message ?? 'Authorized.';
		machine = body?.machine ?? null;
	};
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Scan</h1>
	<p class="text-sm text-slate-300">
		Unified scan hub. Shop attendance scanning will be added here shortly; machine access scanning works now.
	</p>
	{#if error}<p class="rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-100">{error}</p>{/if}
	{#if success}<p class="rounded border border-emerald-700 bg-emerald-900/30 p-2 text-sm text-emerald-100">{success}</p>{/if}

	<div class="grid gap-3 md:grid-cols-2">
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
			<h2 class="mb-2 font-semibold">Machine access scan</h2>
			<QRScanner onDecoded={(v: string) => (token = v)} />
		</div>
		<div class="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
			<label class="flex flex-col gap-1 text-sm">
				<span>Scanned token</span>
				<input class="rounded bg-slate-800 px-2 py-2" bind:value={token} />
			</label>
			<button class="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-slate-900" onclick={useMachine}>
				Check machine authorization
			</button>
			{#if machine}
				<div class="rounded bg-slate-950/50 p-2 text-sm">
					<p class="font-semibold">{machine.name}</p>
					<p class="text-slate-300">{machine.description || 'No description.'}</p>
				</div>
			{/if}
		</div>
	</div>
</section>
