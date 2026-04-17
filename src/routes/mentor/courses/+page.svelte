<script lang="ts">
	let { data } = $props();
	const subteamName = (id: string) =>
		data.subteams.find((s: { id: string; name: string }) => s.id === id)?.name ?? '—';
</script>

<section class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<a href="/mentor" class="text-xs text-slate-400">← Mentor home</a>
			<h1 class="text-2xl font-semibold">Courses</h1>
			<p class="text-sm text-slate-400">
				{data.nodes.length} module{data.nodes.length === 1 ? '' : 's'} in the catalog.
			</p>
		</div>
		<a
			href="/mentor/courses/new"
			class="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-300"
		>
			+ New course
		</a>
	</div>

	<form
		method="GET"
		class="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3"
	>
		<label class="flex flex-1 flex-col gap-1 text-xs text-slate-400">
			<span>Search title</span>
			<input
				name="q"
				value={data.filter.q}
				placeholder="e.g. pneumatics"
				class="rounded bg-slate-800 px-2 py-2 text-sm text-slate-100"
			/>
		</label>
		<label class="flex flex-col gap-1 text-xs text-slate-400">
			<span>Subteam</span>
			<select name="subteam" class="rounded bg-slate-800 px-2 py-2 text-sm text-slate-100">
				<option value="">All subteams</option>
				{#each data.subteams as team}
					<option value={team.id} selected={team.id === data.filter.subteam}>{team.name}</option>
				{/each}
			</select>
		</label>
		<button class="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600" type="submit"
			>Apply</button
		>
		{#if data.filter.q || data.filter.subteam}
			<a href="/mentor/courses" class="rounded border border-slate-800 px-3 py-2 text-sm">Reset</a>
		{/if}
	</form>

	<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
		<table class="w-full text-sm">
			<thead class="bg-slate-800 text-left text-xs uppercase text-slate-400">
				<tr>
					<th class="px-3 py-2">Title</th>
					<th class="px-3 py-2">Slug</th>
					<th class="px-3 py-2">Subteam</th>
					<th class="px-3 py-2 text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.nodes as node (node.id)}
					<tr class="border-t border-slate-800 hover:bg-slate-800">
						<td class="px-3 py-2 font-medium">{node.title}</td>
						<td class="px-3 py-2 text-slate-400">{node.slug}</td>
						<td class="px-3 py-2">{subteamName(node.subteam_id)}</td>
						<td class="px-3 py-2 text-right">
							<a
								href={`/learn/${node.slug}?preview=1`}
								class="mr-2 rounded border border-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
								>Preview</a
							>
							<a
								href={`/mentor/courses/${node.slug}`}
								class="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600">Edit</a
							>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="px-3 py-6 text-center text-slate-400">No courses found.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
