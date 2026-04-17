<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	type Question = {
		id: string;
		prompt: string;
		type: 'mc' | 'tf' | 'short';
		options?: string[];
		correct?: string;
	};

	let {
		questions,
		nodeId,
		segmentId = null,
		blockId = null,
		passingScore = 80,
		allowSubmit = true,
		lockedMessage = ''
	}: {
		questions: Question[];
		nodeId: string;
		segmentId?: string | null;
		blockId?: string | null;
		passingScore?: number;
		allowSubmit?: boolean;
		lockedMessage?: string;
	} = $props();

	let answers = $state<Record<string, string>>({});
	let submitting = $state(false);
	let result = $state<null | { passed: boolean; score: number }>(null);
	let errorMsg = $state('');

	const unanswered = $derived(
		questions.filter((q) => !((answers[q.id] ?? '') + '').trim()).length
	);

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = true;
		errorMsg = '';
		const fd = new FormData();
		fd.set('nodeId', nodeId);
		if (segmentId) fd.set('segmentId', segmentId);
		if (blockId) fd.set('blockId', blockId);
		for (const q of questions) fd.set(q.id, answers[q.id] ?? '');
		try {
			const res = await fetch('/api/quiz/grade', { method: 'POST', body: fd });
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				errorMsg =
					typeof body?.error === 'string' ? body.error : 'Grading failed. Please try again.';
				return;
			}
			const body = (await res.json()) as { passed: boolean; score: number };
			result = body;
			if (body.passed) await invalidateAll();
		} catch {
			errorMsg = 'Network error while grading.';
		} finally {
			submitting = false;
		}
	}

	function retake() {
		answers = {};
		result = null;
		errorMsg = '';
	}
</script>

{#if result?.passed}
	<div class="space-y-3 rounded border border-emerald-200 bg-emerald-50 p-4">
		<p class="text-lg font-semibold text-emerald-800">Passed! Score: {result.score}%</p>
		<p class="text-sm text-emerald-800">
			Your request has been sent to a mentor for the hands-on "Do" checkoff. Visit the
			<a class="underline" href="/passport">passport</a> or your dashboard to track status.
		</p>
	</div>
{:else}
	<form class="space-y-4" onsubmit={onSubmit}>
		{#if result && !result.passed}
			<div class="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
				You scored {result.score}% (need {passingScore}% to pass). Review the questions and try
				again.
			</div>
		{/if}
		{#if errorMsg}
			<div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
				{errorMsg}
			</div>
		{/if}

		{#each questions as question, i (question.id ?? i)}
			<fieldset class="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
				<legend class="px-1 text-xs text-neutral-500">Question {i + 1}</legend>
				<p class="font-medium">{question.prompt}</p>
				{#if question.type === 'mc'}
					<div class="space-y-1">
						{#each question.options ?? [] as option, oi (oi)}
							<label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-neutral-100">
								<input
									type="radio"
									name={question.id}
									value={option}
									class="accent-yellow-400"
									checked={answers[question.id] === option}
									onchange={() => (answers[question.id] = option)}
									required
									disabled={submitting || !allowSubmit}
								/>
								<span>{option}</span>
							</label>
						{/each}
					</div>
				{:else if question.type === 'tf'}
					<div class="flex gap-2">
						{#each ['true', 'false'] as v (v)}
							<label
								class={`cursor-pointer rounded border px-4 py-1 text-sm ${
									answers[question.id] === v
										? 'border-yellow-400 bg-yellow-400/20 text-yellow-200'
										: 'border-neutral-200 bg-neutral-100 hover:bg-neutral-200'
								}`}
							>
								<input
									type="radio"
									name={question.id}
									value={v}
									class="sr-only"
									checked={answers[question.id] === v}
									onchange={() => (answers[question.id] = v)}
									required
									disabled={submitting || !allowSubmit}
								/>
								{v === 'true' ? 'True' : 'False'}
							</label>
						{/each}
					</div>
				{:else}
					<input
						class="w-full rounded bg-neutral-100 px-2 py-2"
						name={question.id}
						bind:value={answers[question.id]}
						placeholder="Your answer"
						required
						disabled={submitting || !allowSubmit}
					/>
				{/if}
			</fieldset>
		{/each}

		<div class="flex flex-wrap items-center gap-3">
			<button
				class="rounded bg-yellow-400 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
				type="submit"
				disabled={!allowSubmit || submitting || unanswered > 0}
			>
				{!allowSubmit ? 'Quiz already passed' : submitting ? 'Grading…' : result && !result.passed ? 'Resubmit' : 'Submit quiz'}
			</button>
			{#if unanswered > 0}
				<span class="text-xs text-neutral-500">{unanswered} question(s) unanswered</span>
			{/if}
			{#if !allowSubmit}
				<span class="text-xs text-neutral-500">{lockedMessage || 'No resubmission needed right now.'}</span>
			{/if}
			{#if result && !result.passed}
				<button
					type="button"
					onclick={retake}
					class="rounded border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-100"
					>Clear answers</button
				>
			{/if}
		</div>
	</form>
{/if}
