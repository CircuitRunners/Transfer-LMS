<script lang="ts">
	let { data, form } = $props();
	const v = (key: string, fallback: string | number = ''): string | number => {
		const values = form?.values as unknown as Record<string, string | number> | undefined;
		return values?.[key] ?? fallback;
	};
</script>

<section class="space-y-4">
	<div>
		<a href="/mentor/courses" class="text-xs text-slate-400">← All courses</a>
		<h1 class="text-2xl font-semibold">New course</h1>
		<p class="text-sm text-slate-400">
			Create the module shell. You'll add video, quiz, and checkoff blocks in the builder after
			saving.
		</p>
	</div>

	{#if form?.error}
		<div class="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		class="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-2"
	>
		<label class="flex flex-col gap-1 text-sm md:col-span-2">
			<span class="text-slate-300">Title</span>
			<input
				class="rounded bg-slate-800 px-2 py-2"
				name="title"
				value={v('title')}
				placeholder="Drill Press Basics"
				required
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-slate-300">Slug</span>
			<input
				class="rounded bg-slate-800 px-2 py-2"
				name="slug"
				value={v('slug')}
				placeholder="drill-press-basics (auto from title if blank)"
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-slate-300">Subteam</span>
			<select class="rounded bg-slate-800 px-2 py-2" name="subteam_id" required>
				<option value="">Select subteam…</option>
				{#each data.subteams as team}
					<option value={team.id} selected={team.id === v('subteamId', '')}>{team.name}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1 text-sm md:col-span-2">
			<span class="text-slate-300">Video URL</span>
			<input
				class="rounded bg-slate-800 px-2 py-2"
				name="video_url"
				value={v('videoUrl')}
				placeholder="https://www.youtube.com/..."
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm md:col-span-2">
			<span class="text-slate-300">Description</span>
			<textarea class="rounded bg-slate-800 px-2 py-2" name="description" rows="3"
				>{v('description')}</textarea
			>
		</label>
		<div class="flex justify-end gap-2 md:col-span-2">
			<a href="/mentor/courses" class="rounded border border-slate-700 px-4 py-2 text-sm">Cancel</a>
			<button
				class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900"
				type="submit">Create course</button
			>
		</div>
	</form>
</section>
