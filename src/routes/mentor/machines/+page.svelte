<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let name = $state('');
	let description = $state('');
	let location = $state('');
	let requiredNodeIds = $state<string[]>([]);
	let error = $state('');
	let success = $state('');
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let editLocation = $state('');
	let editRequiredNodeIds = $state<string[]>([]);

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
	const beginEdit = (m: any) => {
		editingId = m.id;
		editName = String(m.name ?? '');
		editDescription = String(m.description ?? '');
		editLocation = String(m.location ?? '');
		editRequiredNodeIds = Array.isArray(m.required_node_ids) ? m.required_node_ids.map(String) : [];
		error = '';
		success = '';
	};
	const cancelEdit = () => {
		editingId = null;
		editName = '';
		editDescription = '';
		editLocation = '';
		editRequiredNodeIds = [];
	};
	const toggleEditRequirement = (id: string, checked: boolean) => {
		if (checked) editRequiredNodeIds = Array.from(new Set([...editRequiredNodeIds, id]));
		else editRequiredNodeIds = editRequiredNodeIds.filter((x) => x !== id);
	};
	const saveMachine = async () => {
		if (!editingId) return;
		const res = await fetch('/api/machines/update', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				machineId: editingId,
				name: editName,
				description: editDescription,
				location: editLocation,
				requiredNodeIds: editRequiredNodeIds
			})
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Could not update machine.';
			return;
		}
		success = `Updated ${body?.machine?.name ?? 'machine'}.`;
		error = '';
		cancelEdit();
		await invalidateAll();
	};
	const deleteMachine = async (m: any) => {
		if (!confirm(`Delete ${m.name}? This cannot be undone.`)) return;
		const res = await fetch('/api/machines/delete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ machineId: m.id })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.error ?? 'Could not delete machine.';
			return;
		}
		success = `Deleted ${m.name}.`;
		error = '';
		if (editingId === m.id) cancelEdit();
		await invalidateAll();
	};
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Machine Shop Admin</h1>
	<p class="text-sm text-slate-300">
		Create machine entries with required completed training and print QR codes for shop access.
	</p>
	{#if error}<p class="rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-200">{error}</p>{/if}
	{#if success}<p class="rounded border border-emerald-700 bg-emerald-900/30 p-2 text-sm text-emerald-200">{success}</p>{/if}

	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h2 class="mb-2 font-semibold">Create machine</h2>
		<div class="grid gap-3 md:grid-cols-2">
			<label class="flex flex-col gap-1 text-sm">
				<span>Name</span>
				<input class="rounded bg-slate-800 px-2 py-2" bind:value={name} placeholder="Bandsaw A" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				<span>Location</span>
				<input class="rounded bg-slate-800 px-2 py-2" bind:value={location} placeholder="North wall bay" />
			</label>
			<label class="flex flex-col gap-1 text-sm md:col-span-2">
				<span>Description</span>
				<textarea class="rounded bg-slate-800 px-2 py-2" rows="3" bind:value={description}></textarea>
			</label>
			<div class="md:col-span-2">
				<p class="mb-1 text-sm text-slate-300">Required completed training</p>
				<div class="grid max-h-44 gap-1 overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-2 md:grid-cols-2">
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
			<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<h3 class="font-semibold">{m.name}</h3>
						<p class="text-xs text-slate-400">{m.location || 'No location set'}</p>
					</div>
					{#if m.qrDataUrl}
						<a href={m.qrDataUrl} download={`${m.name}-qr.png`} class="text-xs text-yellow-300 underline">Download QR</a>
					{/if}
				</div>
				<p class="mt-2 text-sm text-slate-300">{m.description || 'No description.'}</p>
				<p class="mt-2 text-xs text-slate-400">
					Required: {Array.isArray(m.required_node_ids) && m.required_node_ids.length > 0
						? m.required_node_ids.map((id: string) => trainingName(id)).join(', ')
						: 'None'}
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
						onclick={() => beginEdit(m)}
					>
						Edit
					</button>
					<button
						type="button"
						class="rounded border border-red-700 px-2 py-1 text-xs text-red-200 hover:bg-red-900/30"
						onclick={() => deleteMachine(m)}
					>
						Delete
					</button>
				</div>
				{#if editingId === m.id}
					<div class="mt-3 space-y-3 rounded-md border border-slate-700 bg-slate-900/60 p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Edit machine</p>
						<div class="grid gap-3 md:grid-cols-2">
							<label class="flex flex-col gap-1 text-sm">
								<span>Name</span>
								<input class="rounded bg-slate-800 px-2 py-2" bind:value={editName} />
							</label>
							<label class="flex flex-col gap-1 text-sm">
								<span>Location</span>
								<input class="rounded bg-slate-800 px-2 py-2" bind:value={editLocation} />
							</label>
							<label class="flex flex-col gap-1 text-sm md:col-span-2">
								<span>Description</span>
								<textarea class="rounded bg-slate-800 px-2 py-2" rows="3" bind:value={editDescription}></textarea>
							</label>
							<div class="md:col-span-2">
								<p class="mb-1 text-sm text-slate-300">Required completed training</p>
								<div class="grid max-h-40 gap-1 overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-2 md:grid-cols-2">
									{#each data.courses as c}
										<label class="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={editRequiredNodeIds.includes(c.id)}
												onchange={(e) => toggleEditRequirement(c.id, (e.currentTarget as HTMLInputElement).checked)}
											/>
											<span>{c.title}</span>
										</label>
									{/each}
								</div>
							</div>
							<div class="md:col-span-2 flex justify-end gap-2">
								<button
									type="button"
									class="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
									onclick={cancelEdit}
								>
									Cancel
								</button>
								<button
									type="button"
									class="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-slate-900"
									onclick={saveMachine}
								>
									Save changes
								</button>
							</div>
						</div>
					</div>
				{/if}
				{#if m.qrDataUrl}
					<img src={m.qrDataUrl} alt={`${m.name} QR`} class="mt-3 w-40 rounded bg-slate-900 p-2" />
				{/if}
			</div>
		{:else}
			<p class="text-slate-400">No machines created yet.</p>
		{/each}
	</div>

	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h2 class="mb-2 font-semibold">Recent machine use scans</h2>
		<ul class="space-y-2 text-sm">
			{#each data.usageEvents as evt}
				<li class="rounded border border-slate-800 bg-slate-900/40 p-2">
					<span class={evt.authorized ? 'text-emerald-300' : 'text-red-300'}>
						{evt.authorized ? 'Authorized' : 'Denied'}
					</span>
					· {evt.user?.full_name || evt.user?.email || evt.user_id} · {evt.machine?.name || evt.machine_id}
					· {new Date(evt.created_at).toLocaleString()}
				</li>
			{:else}
				<li class="text-slate-400">No usage events yet.</li>
			{/each}
		</ul>
	</div>
</section>
