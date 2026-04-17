<script lang="ts">
	let { qrDataUrl }: { qrDataUrl: string } = $props();
</script>

{#if qrDataUrl}
	<img src={qrDataUrl} alt="Passport QR code" class="h-56 w-56 rounded bg-slate-900 p-2" />
{/if}
