<script lang="ts">
	let { data, form } = $props();
</script>

<section class="max-w-2xl space-y-4">
	<h1 class="text-2xl font-semibold">Workspace Settings</h1>
	<p class="text-sm text-neutral-500">Controls the workspace subtitle shown under "Transfer".</p>

	{#if form?.error}
		<p class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{form.error}</p>
	{/if}
	{#if form?.ok}
		<p class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
			Settings saved.
		</p>
	{/if}

	<form method="POST" action="?/save" class="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-neutral-700">Organization name</span>
			<input class="rounded bg-neutral-100 px-2 py-2" name="name" required value={data.orgName} />
		</label>
		<div class="flex justify-end">
			<button class="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900">
				Save
			</button>
		</div>
	</form>
</section>
