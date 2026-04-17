<script lang="ts">
	let { data } = $props();
	let name = $state('');
	let description = $state('');
	let location = $state('');
	let requiredNodeIds = $state<string[]>([]);
	let error = $state('');
	let success = $state('');

	const toggleRequirement = (id: string, checked: boolean) => {
		if (checked) requiredNodeIds = Array.from(new Set([...requiredNodeIds, id]));
		else requiredNodeIds = requiredNodeIds.filter((x) => x !== id);
	};

	const createMachine = async () => {
		const res = await fetch('/api/machines/create', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, description, location, requiredNodeIds })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Could not create machine.';
			return;
		}
		error = '';
		success = `Created ${body?.machine?.name ?? 'machine'}. Refresh to view QR card.`;
		name = '';
		description = '';
		location = '';
		requiredNodeIds = [];
	};

	const trainingName = (id: string) => data.courses.find((c: any) => c.id === id)?.title ?? id;
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Machine Shop Admin</h1>
	<p class="text-sm text-neutral-700">
		Create machine entries with required completed training and print QR codes for shop access.
	</p>
	{#if error}<p class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>{/if}
	{#if success}<p class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{success}</p>{/if}

	<div class="rounded-xl border border-neutral-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Create machine</h2>
		<div class="grid gap-3 md:grid-cols-2">
			<label class="flex flex-col gap-1 text-sm">
				<span>Name</span>
				<input class="rounded bg-neutral-100 px-2 py-2" bind:value={name} placeholder="Bandsaw A" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				<span>Location</span>
				<input class="rounded bg-neutral-100 px-2 py-2" bind:value={location} placeholder="North wall bay" />
			</label>
			<label class="flex flex-col gap-1 text-sm md:col-span-2">
				<span>Description</span>
				<textarea class="rounded bg-neutral-100 px-2 py-2" rows="3" bind:value={description}></textarea>
			</label>
			<div class="md:col-span-2">
				<p class="mb-1 text-sm text-neutral-700">Required completed training</p>
				<div class="grid max-h-44 gap-1 overflow-y-auto rounded border border-neutral-200 bg-white/40 p-2 md:grid-cols-2">
					{#each data.courses as c}
						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={requiredNodeIds.includes(c.id)}
								onchange={(e) => toggleRequirement(c.id, (e.currentTarget as HTMLInputElement).checked)}
							/>
							<span>{c.title}</span>
						</label>
					{/each}
				</div>
			</div>
			<div class="md:col-span-2 flex justify-end">
				<button class="rounded bg-yellow-400 px-3 py-2 font-semibold text-slate-900" onclick={createMachine}>
					Create machine
				</button>
			</div>
		</div>
	</div>

	<div class="grid gap-3 md:grid-cols-2">
		{#each data.machines as m}
			<div class="rounded-xl border border-neutral-200 bg-white p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<h3 class="font-semibold">{m.name}</h3>
						<p class="text-xs text-neutral-500">{m.location || 'No location set'}</p>
					</div>
					{#if m.qrDataUrl}
						<a href={m.qrDataUrl} download={`${m.name}-qr.png`} class="text-xs text-yellow-300 underline">Download QR</a>
					{/if}
				</div>
				<p class="mt-2 text-sm text-neutral-700">{m.description || 'No description.'}</p>
				<p class="mt-2 text-xs text-neutral-500">
					Required: {Array.isArray(m.required_node_ids) && m.required_node_ids.length > 0
						? m.required_node_ids.map((id: string) => trainingName(id)).join(', ')
						: 'None'}
				</p>
				{#if m.qrDataUrl}
					<img src={m.qrDataUrl} alt={`${m.name} QR`} class="mt-3 w-40 rounded bg-white p-2" />
				{/if}
			</div>
		{:else}
			<p class="text-neutral-500">No machines created yet.</p>
		{/each}
	</div>

	<div class="rounded-xl border border-neutral-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Recent machine use scans</h2>
		<ul class="space-y-2 text-sm">
			{#each data.usageEvents as evt}
				<li class="rounded border border-neutral-200 bg-white/40 p-2">
					<span class={evt.authorized ? 'text-emerald-700' : 'text-red-700'}>
						{evt.authorized ? 'Authorized' : 'Denied'}
					</span>
					· {evt.user?.full_name || evt.user?.email || evt.user_id} · {evt.machine?.name || evt.machine_id}
					· {new Date(evt.created_at).toLocaleString()}
				</li>
			{:else}
				<li class="text-neutral-500">No usage events yet.</li>
			{/each}
		</ul>
	</div>
</section>
