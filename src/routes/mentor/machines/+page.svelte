<script lang="ts">
	import QRScanner from '$lib/components/QRScanner.svelte';

	let { data } = $props();
	const machines = $derived(data.machines ?? []);
	let selectedMachineId = $state<string>('');
	let scanToken = $state('');
	let scanStudent = $state<any>(null);
	let note = $state('');
	let error = $state('');
	let success = $state('');
	const initialSessions = $derived(data.activeSessions ?? []);
	let activeSessions = $state<any[]>([]);

	$effect(() => {
		activeSessions = initialSessions;
	});

	const machineById = (id: string) => machines.find((m: any) => m.id === id);

	const onDecoded = async (token: string) => {
		const res = await fetch('/api/mentor/resolve-qr', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Failed to resolve passport QR';
			return;
		}
		scanToken = token;
		scanStudent = body?.profile ?? null;
		error = '';
		success = scanStudent ? `Scanned ${scanStudent.full_name || scanStudent.email}` : 'Scan resolved.';
	};

	const checkout = async () => {
		if (!selectedMachineId || !scanToken) {
			error = 'Select a machine and scan student passport first.';
			return;
		}
		const res = await fetch('/api/machines/checkout', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ machineId: selectedMachineId, qrToken: scanToken, notes: note })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Checkout failed.';
			return;
		}
		error = '';
		success = `Checked out ${machineById(selectedMachineId)?.name ?? 'machine'} to ${scanStudent?.full_name || scanStudent?.email}.`;
		activeSessions = [body.session, ...activeSessions];
	};

	const checkin = async (sessionId: string) => {
		const res = await fetch('/api/machines/checkin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sessionId })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Check-in failed.';
			return;
		}
		error = '';
		success = 'Tool checked back in.';
		activeSessions = activeSessions.filter((s) => s.id !== sessionId);
	};
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Machine Shop Checkout</h1>
	<p class="text-sm text-slate-300">
		Mentor scans student passport QR, then checks machine in/out. Access is validated against required
		certifications.
	</p>

	{#if error}<p class="rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-100">{error}</p>{/if}
	{#if success}<p class="rounded border border-emerald-700 bg-emerald-900/30 p-2 text-sm text-emerald-100">{success}</p>{/if}

	<div class="grid gap-3 md:grid-cols-2">
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
			<h2 class="mb-2 font-semibold">1) Scan student passport</h2>
			<QRScanner onDecoded={onDecoded} />
			{#if scanStudent}
				<p class="mt-2 text-sm text-slate-300">Student: {scanStudent.full_name || scanStudent.email}</p>
			{/if}
		</div>
		<div class="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
			<h2 class="font-semibold">2) Checkout machine</h2>
			<label class="flex flex-col gap-1 text-sm">
				<span>Machine</span>
				<select bind:value={selectedMachineId} class="rounded bg-slate-800 px-2 py-2">
					<option value="">Select machine...</option>
					{#each machines as m}
						<option value={m.id}>{m.name} ({m.location})</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				<span>Notes</span>
				<textarea bind:value={note} class="rounded bg-slate-800 px-2 py-2" rows="3"></textarea>
			</label>
			<button class="rounded bg-yellow-400 px-3 py-2 font-semibold text-slate-900" onclick={checkout}>
				Check out machine
			</button>
		</div>
	</div>

	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h2 class="mb-2 font-semibold">Currently Checked Out</h2>
		<ul class="space-y-2 text-sm">
			{#each activeSessions as s}
				<li class="flex items-center justify-between rounded border border-slate-800 bg-slate-950/40 p-2">
					<span>
						{s.machine?.name || 'Unknown machine'} · {s.student?.full_name || s.student?.email || s.student_id}
						· since {new Date(s.started_at).toLocaleString()}
					</span>
					<button class="rounded border border-slate-700 px-2 py-1" onclick={() => checkin(s.id)}>
						Check in
					</button>
				</li>
			{:else}
				<li class="text-slate-400">No active checkouts.</li>
			{/each}
		</ul>
	</div>

	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h2 class="mb-2 font-semibold">Recent Check-ins</h2>
		<ul class="space-y-2 text-sm">
			{#each data.recentSessions as s}
				<li class="rounded border border-slate-800 bg-slate-950/40 p-2">
					{s.machine?.name || 'Unknown machine'} · {s.student?.full_name || s.student?.email || s.student_id}
					· checked in {new Date(s.ended_at).toLocaleString()}
				</li>
			{:else}
				<li class="text-slate-400">No recent check-ins.</li>
			{/each}
		</ul>
	</div>
</section>
