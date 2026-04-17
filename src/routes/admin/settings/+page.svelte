<script lang="ts">
	let { data, form } = $props();
</script>

<section class="max-w-2xl space-y-4">
	<h1 class="text-2xl font-semibold">Workspace Settings</h1>
	<p class="text-sm text-slate-400">Controls the workspace subtitle shown under "Transfer".</p>

	{#if form?.error}
		<p class="rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-200">{form.error}</p>
	{/if}
	{#if form?.ok}
		<p class="rounded border border-emerald-700 bg-emerald-900/30 p-2 text-sm text-emerald-200">
			Settings saved.
		</p>
	{/if}

	<form method="POST" action="?/save" class="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-slate-300">Organization name</span>
			<input class="rounded bg-slate-800 px-2 py-2" name="name" required value={data.orgName} />
		</label>
		<div class="flex justify-end">
			<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900">
				Save
			</button>
		</div>
	</form>
</section>
