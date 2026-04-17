<script lang="ts">
	import { SvelteFlow, Background, Controls, type Node, type Edge } from '@xyflow/svelte';
	let { nodes = [], statuses = [], prerequisites = [] } = $props();
	const hasGraphData = $derived((nodes?.length ?? 0) > 0 && (prerequisites?.length ?? 0) > 0);

	const flowNodes = $derived.by(() => {
		const statusMap = new Map(
			statuses.map((s: { node_id: string; computed_status: string }) => [
				s.node_id,
				s.computed_status
			])
		);
		const incoming = new Map<string, number>();
		const children = new Map<string, string[]>();
		for (const n of nodes as { id: string }[]) {
			incoming.set(n.id, 0);
			children.set(n.id, []);
		}
		for (const edge of prerequisites as { node_id: string; prerequisite_node_id: string }[]) {
			if (!incoming.has(edge.node_id) || !children.has(edge.prerequisite_node_id)) continue;
			incoming.set(edge.node_id, (incoming.get(edge.node_id) ?? 0) + 1);
			children.get(edge.prerequisite_node_id)?.push(edge.node_id);
		}

		const queue: string[] = [];
		const layer = new Map<string, number>();
		for (const [id, deg] of incoming.entries()) {
			if (deg === 0) queue.push(id);
		}
		while (queue.length > 0) {
			const cur = queue.shift() as string;
			const curLayer = layer.get(cur) ?? 0;
			for (const next of children.get(cur) ?? []) {
				layer.set(next, Math.max(layer.get(next) ?? 0, curLayer + 1));
				incoming.set(next, (incoming.get(next) ?? 1) - 1);
				if (incoming.get(next) === 0) queue.push(next);
			}
		}

		const perLayerCounts = new Map<number, number>();
		for (const n of nodes as { id: string }[]) {
			const l = layer.get(n.id) ?? 0;
			perLayerCounts.set(l, (perLayerCounts.get(l) ?? 0) + 1);
		}
		const perLayerOffset = new Map<number, number>();

		return nodes.map((n: { id: string; title: string }) => {
			const status = statusMap.get(n.id) ?? 'locked';
			const color =
				status === 'completed'
					? '#16a34a'
					: status === 'available'
						? '#facc15'
						: status === 'mentor_checkoff_pending'
							? '#0ea5e9'
							: '#64748b';
			const l = layer.get(n.id) ?? 0;
			const idxInLayer = perLayerOffset.get(l) ?? 0;
			perLayerOffset.set(l, idxInLayer + 1);
			const layerSize = perLayerCounts.get(l) ?? 1;
			const yStart = -((layerSize - 1) * 100) / 2;
			return {
				id: n.id,
				position: { x: l * 280, y: yStart + idxInLayer * 100 },
				data: { label: n.title },
				style: `background:${color};color:#0f172a;border-radius:8px;padding:6px 10px;`
			} as Node;
		});
	});

	const flowEdges: Edge[] = $derived(
		(prerequisites as { node_id: string; prerequisite_node_id: string }[]).map((p) => ({
			id: `${p.prerequisite_node_id}->${p.node_id}`,
			source: p.prerequisite_node_id,
			target: p.node_id
		}))
	);
</script>

{#if hasGraphData}
	<div
		class="h-[480px] overflow-hidden rounded-xl border border-neutral-200 bg-white"
		style="--xy-background-color:#020617;--xy-controls-button-background-color:#0f172a;--xy-controls-button-color:#cbd5e1;"
	>
		<SvelteFlow nodes={flowNodes} edges={flowEdges} fitView>
			<Background />
			<Controls />
		</SvelteFlow>
	</div>
{:else}
	<div class="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
		No prerequisite graph to show yet.
	</div>
{/if}
