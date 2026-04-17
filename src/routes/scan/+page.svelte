<script lang="ts">
	import QRScanner from '$lib/components/QRScanner.svelte';
	let { data } = $props();

	let status = $state<'idle' | 'checking' | 'ok' | 'denied'>('idle');
	let message = $state('');
	let machine = $state<{ name?: string; description?: string } | null>(null);
	let lastToken = $state('');

	const authorize = async (token: string) => {
		if (!token || token === lastToken) return;
		lastToken = token;
		status = 'checking';
		message = '';
		machine = null;
		try {
			const res = await fetch('/api/machines/use', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ machineToken: token })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				status = 'denied';
				message = body?.error ?? 'Not authorized.';
				machine = body?.machine ?? null;
				return;
			}
			status = 'ok';
			message = body?.message ?? 'Authorized.';
			machine = body?.machine ?? null;
		} catch {
			status = 'denied';
			message = 'Network error. Try again.';
		}
	};

	// Auto-authorize if arriving with ?machine=...
	$effect(() => {
		if (data.machineToken) authorize(data.machineToken);
	});

	const reset = () => {
		status = 'idle';
		message = '';
		machine = null;
		lastToken = '';
	};
</script>

<section class="space-y-6">
	<header>
		<p class="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Scan</p>
		<h1 class="mt-1 text-3xl font-semibold tracking-tight">Machine &amp; shop access</h1>
		<p class="mt-2 max-w-2xl text-sm text-slate-400">
			Point your camera at a machine's QR code. Authorization is checked against your completed
			training. Shop attendance scanning will land here next.
		</p>
	</header>

	<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
		<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
			<div class="border-b border-slate-800 px-5 py-3">
				<p class="text-sm font-medium">Scanner</p>
			</div>
			<div class="p-4">
				<QRScanner onDecoded={(v: string) => authorize(v.trim())} />
			</div>
		</div>

		<div class="space-y-4">
			{#if status === 'idle'}
				<div class="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
					Waiting for a scan…
				</div>
			{:else if status === 'checking'}
				<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-300">
					Checking authorization…
				</div>
			{:else if status === 'ok'}
				<div class="rounded-xl border border-emerald-700 bg-emerald-900/30 p-6">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						Authorized
					</p>
					<p class="mt-2 text-xl font-semibold text-emerald-900">{machine?.name ?? 'Machine'}</p>
					<p class="mt-1 text-sm text-emerald-900/80">{message}</p>
					{#if machine?.description}
						<p class="mt-3 border-t border-emerald-700 pt-3 text-sm text-emerald-900/80">
							{machine.description}
						</p>
					{/if}
				</div>
			{:else}
				<div class="rounded-xl border border-red-700 bg-red-900/30 p-6">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">Denied</p>
					<p class="mt-2 text-xl font-semibold text-red-900">{machine?.name ?? 'Not authorized'}</p>
					<p class="mt-1 text-sm text-red-900/80">{message}</p>
				</div>
			{/if}

			{#if status !== 'idle'}
				<button
					type="button"
					onclick={reset}
					class="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900/50"
				>
					Scan another
				</button>
			{/if}
		</div>
	</div>
</section>
