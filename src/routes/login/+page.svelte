<script lang="ts">
	let { data } = $props();
</script>

<section class="mx-auto max-w-md space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
	<h1 class="text-2xl font-semibold">Sign in</h1>
	<p class="text-sm text-neutral-700">Use your team Google Workspace account to continue.</p>
	{#if data?.error}
		<p class="rounded bg-red-50 p-2 text-sm text-red-800">{data.error}</p>
	{/if}
	<form method="POST" action="/auth/google">
		<button
			class="w-full rounded bg-yellow-400 px-4 py-2 font-semibold text-slate-900"
			type="submit"
		>
			Continue with Google
		</button>
	</form>
</section>
