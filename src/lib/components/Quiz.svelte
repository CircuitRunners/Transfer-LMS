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
		passingScore = 80,
		allowSubmit = true,
		lockedMessage = ''
	}: {
		questions: Question[];
		nodeId: string;
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
	<div class="space-y-3 rounded border border-emerald-700 bg-emerald-900/30 p-4">
		<p class="text-lg font-semibold text-emerald-200">Passed! Score: {result.score}%</p>
		<p class="text-sm text-emerald-100">
			Your request has been sent to a mentor for the hands-on "Do" checkoff. Visit the
			<a class="underline" href="/passport">passport</a> or your dashboard to track status.
		</p>
	</div>
{:else}
	<form class="space-y-4" onsubmit={onSubmit}>
		{#if result && !result.passed}
			<div class="rounded border border-amber-700 bg-amber-900/30 p-3 text-sm text-amber-100">
				You scored {result.score}% (need {passingScore}% to pass). Review the questions and try
				again.
			</div>
		{/if}
		{#if errorMsg}
			<div class="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-100">
				{errorMsg}
			</div>
		{/if}

		{#each questions as question, i (question.id ?? i)}
			<fieldset class="space-y-2 rounded border border-slate-700 bg-slate-900/60 p-3">
				<legend class="px-1 text-xs text-slate-400">Question {i + 1}</legend>
				<p class="font-medium">{question.prompt}</p>
				{#if question.type === 'mc'}
					<div class="space-y-1">
						{#each question.options ?? [] as option, oi (oi)}
							<label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-800">
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
										: 'border-slate-700 bg-slate-800 hover:bg-slate-700'
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
						class="w-full rounded bg-slate-800 px-2 py-2"
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
				<span class="text-xs text-slate-400">{unanswered} question(s) unanswered</span>
			{/if}
			{#if !allowSubmit}
				<span class="text-xs text-slate-400">{lockedMessage || 'No resubmission needed right now.'}</span>
			{/if}
			{#if result && !result.passed}
				<button
					type="button"
					onclick={retake}
					class="rounded border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
					>Clear answers</button
				>
			{/if}
		</div>
	</form>
{/if}
