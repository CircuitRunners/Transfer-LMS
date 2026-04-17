<script lang="ts">
	interface Props {
		name?: string | null;
		email?: string | null;
		url?: string | null;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		ring?: boolean;
		title?: string;
	}
	let { name = '', email = '', url = '', size = 'md', ring = false, title }: Props = $props();

	const sizeMap = {
		xs: 'h-6 w-6 text-[10px]',
		sm: 'h-8 w-8 text-xs',
		md: 'h-10 w-10 text-sm',
		lg: 'h-14 w-14 text-base',
		xl: 'h-20 w-20 text-lg'
	};

	const initials = $derived.by(() => {
		const src = (name || '').trim() || (email || '').split('@')[0] || '?';
		const parts = src.split(/[\s._-]+/).filter(Boolean);
		const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
		return letters.toUpperCase();
	});

	const bgClass = $derived.by(() => {
		const palette = [
			'bg-slate-900',
			'bg-slate-700',
			'bg-amber-600',
			'bg-sky-700',
			'bg-emerald-700',
			'bg-rose-700',
			'bg-indigo-700',
			'bg-stone-700'
		];
		const src = (name || email || '').toLowerCase();
		let hash = 0;
		for (let i = 0; i < src.length; i++) hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
		return palette[hash % palette.length];
	});
</script>

{#if url}
	<img
		src={url}
		alt={name || 'avatar'}
		title={title ?? name ?? ''}
		class={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full object-cover ${sizeMap[size]} ${ring ? 'ring-2 ring-white' : ''}`}
	/>
{:else}
	<span
		title={title ?? name ?? ''}
		class={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizeMap[size]} ${bgClass} ${ring ? 'ring-2 ring-white' : ''}`}
	>
		{initials}
	</span>
{/if}
