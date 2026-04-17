<script lang="ts">
	let { data } = $props();
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Content Management</h1>
	<form
		method="POST"
		action="?/createNode"
		class="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-2"
	>
		<input class="rounded bg-slate-800 px-2 py-2" name="title" placeholder="Title" required />
		<input class="rounded bg-slate-800 px-2 py-2" name="slug" placeholder="slug-value" required />
		<input
			class="rounded bg-slate-800 px-2 py-2"
			name="video_url"
			placeholder="YouTube URL"
			required
		/>
		<select class="rounded bg-slate-800 px-2 py-2" name="subteam_id" required>
			{#each data.subteams as team}
				<option value={team.id}>{team.name}</option>
			{/each}
		</select>
		<textarea
			class="rounded bg-slate-800 px-2 py-2 md:col-span-2"
			name="description"
			placeholder="Description"
		></textarea>
		<button
			class="rounded bg-yellow-400 px-4 py-2 font-semibold text-slate-900 md:col-span-2"
			type="submit">Create Node</button
		>
	</form>

	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h2 class="mb-2 font-semibold">Existing Nodes</h2>
		<ul class="space-y-1 text-sm text-slate-300">
			{#each data.nodes as node}
				<li>{node.title} ({node.slug})</li>
			{/each}
		</ul>
	</div>
</section>
