<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import Quiz from '$lib/components/Quiz.svelte';

	let { data, form } = $props();

	function extractVideoId(url: string): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			const host = u.hostname.replace(/^www\./, '');
			if (host === 'youtu.be') {
				const id = u.pathname.slice(1);
				return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
			}
			if (host.endsWith('youtube.com')) {
				if (u.pathname === '/watch') {
					const id = u.searchParams.get('v') ?? '';
					return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
				}
				if (u.pathname.startsWith('/embed/')) {
					const id = u.pathname.split('/')[2] ?? '';
					return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
				}
			}
			return null;
		} catch {
			return null;
		}
	}

	const videoId = $derived(extractVideoId(data.node.video_url ?? ''));

	const certStatus = $derived(data.certStatus as string);
	const reviewStatus = $derived((data.review?.status as string | undefined) ?? '');
	const effectiveStatus = $derived.by(() => {
		if (certStatus === 'mentor_checkoff_pending' && reviewStatus === 'needs_review') {
			return 'checkoff_needs_review';
		}
		if (certStatus === 'mentor_checkoff_pending' && reviewStatus === 'blocked') {
			return 'checkoff_blocked';
		}
		return certStatus;
	});
	const videoDone = $derived(
		certStatus === 'quiz_pending' ||
			certStatus === 'mentor_checkoff_pending' ||
			certStatus === 'completed'
	);
	const awaitingMentor = $derived(certStatus === 'mentor_checkoff_pending');
	const completed = $derived(certStatus === 'completed');
	const locked = $derived(certStatus === 'locked');

	let marking = $state(false);

	async function markWatched() {
		if (marking) return;
		marking = true;
		try {
			await fetch('/api/nodes/video-complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ nodeId: data.node.id })
			});
			await invalidateAll();
		} finally {
			marking = false;
		}
	}

	const statusLabels: Record<string, { label: string; tone: string }> = {
		locked: { label: 'Locked (complete prerequisites first)', tone: 'slate' },
		available: { label: 'Available — watch the video to begin', tone: 'slate' },
		video_pending: { label: 'Video in progress', tone: 'slate' },
		quiz_pending: { label: 'Quiz unlocked', tone: 'yellow' },
		mentor_checkoff_pending: { label: 'Awaiting mentor checkoff', tone: 'sky' },
		checkoff_needs_review: { label: 'Action required: redo checkoff', tone: 'yellow' },
		checkoff_blocked: { label: 'Blocked by mentor', tone: 'red' },
		completed: { label: 'Completed', tone: 'emerald' }
	};
	const statusInfo = $derived(
		statusLabels[effectiveStatus] ?? { label: effectiveStatus, tone: 'slate' }
	);

	const initialSubmissionPhotos = $derived.by(() => {
		if (Array.isArray(data.submission?.photo_data_urls) && data.submission.photo_data_urls.length > 0) {
			return data.submission.photo_data_urls as string[];
		}
		if (data.submission?.photo_data_url) return [data.submission.photo_data_url] as string[];
		return [] as string[];
	});
	let uploadPreviews = $state<string[]>([]);
	$effect(() => {
		uploadPreviews = initialSubmissionPhotos;
	});
	let checkoffMessage = $state('');

	const checklist = $derived(Array.isArray(data.checkoff?.mentor_checklist) ? data.checkoff.mentor_checklist : []);
	const resourceLinks = $derived(
		Array.isArray(data.checkoff?.resource_links) ? data.checkoff.resource_links : []
	);
	const showCheckoffSection = $derived(videoDone && (awaitingMentor || completed));
	const blockedByMentor = $derived(data.review?.status === 'blocked' && awaitingMentor);
	const allowQuizSubmit = $derived(certStatus === 'quiz_pending');
	const quizLockedMessage = $derived.by(() => {
		if (effectiveStatus === 'checkoff_needs_review') {
			return 'Quiz is already passed. Action required: redo your checkoff based on mentor feedback.';
		}
		if (effectiveStatus === 'checkoff_blocked') {
			return 'Quiz is passed, but checkoff is blocked until mentor concerns are resolved.';
		}
		if (certStatus === 'mentor_checkoff_pending') {
			return 'Quiz is already passed. Awaiting mentor checkoff.';
		}
		if (certStatus === 'completed') {
			return 'Quiz and checkoff completed.';
		}
		return '';
	});

	async function compressImage(file: File): Promise<string> {
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(new Error('Could not read image'));
			reader.readAsDataURL(file);
		});
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error('Could not load image'));
			el.src = dataUrl;
		});
		const maxDim = 1280;
		const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
		const width = Math.max(1, Math.round(img.width * scale));
		const height = Math.max(1, Math.round(img.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return dataUrl;
		ctx.drawImage(img, 0, 0, width, height);
		return canvas.toDataURL('image/jpeg', 0.78);
	}

	async function onPhotoSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		const accepted = files.filter((f) => f.type.startsWith('image/')).slice(0, 4);
		if (!accepted.length) {
			checkoffMessage = 'Please choose image files.';
			return;
		}
		const compressed: string[] = [];
		for (const file of accepted) {
			const next = await compressImage(file);
			compressed.push(next);
		}
		uploadPreviews = compressed;
		checkoffMessage = 'Photos prepared and compressed for upload.';
	}

	function removePhoto(index: number) {
		uploadPreviews = uploadPreviews.filter((_, i) => i !== index);
		checkoffMessage = 'Photo removed. Save to persist this change.';
	}
</script>

<section class="space-y-4">
	<div>
		<a href="/dashboard" class="text-xs text-slate-400">← Dashboard</a>
		<h1 class="text-2xl font-semibold">{data.node.title}</h1>
		<p class="text-slate-300">{data.node.description}</p>
		<p class="mt-2 text-xs">
			<span
				class={`inline-flex rounded-full px-2 py-0.5 ${
					statusInfo.tone === 'emerald'
						? 'bg-emerald-900/40 text-emerald-200'
						: statusInfo.tone === 'red'
							? 'bg-red-900/40 text-red-200'
						: statusInfo.tone === 'sky'
							? 'bg-sky-900/40 text-sky-200'
							: statusInfo.tone === 'yellow'
								? 'bg-yellow-900/40 text-yellow-200'
								: 'bg-slate-800 text-slate-300'
				}`}
			>
				{statusInfo.label}
			</span>
		</p>
	</div>

	{#if locked}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
			This module is locked. Complete its prerequisites on the
			<a class="text-yellow-300 underline" href="/dashboard">dashboard</a> first.
		</div>
	{:else}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
			{#if videoId}
				<VideoPlayer {videoId} onCompleted={markWatched} />
			{:else if data.node.video_url}
				<div class="space-y-2 p-3">
					<p class="text-sm text-slate-300">
						This module's video can't be embedded (likely a playlist or search link).
					</p>
					<a
						href={data.node.video_url}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
						>Open video on YouTube ↗</a
					>
				</div>
			{:else}
				<p class="p-3 text-sm text-slate-300">No video has been attached to this module yet.</p>
			{/if}

			{#if !videoDone}
				<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
					<button
						class="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-60"
						onclick={markWatched}
						disabled={marking}
					>
						{marking ? 'Marking…' : 'I finished the video'}
					</button>
					<span class="text-xs text-slate-400"
						>Marks the video as watched so the quiz unlocks.</span
					>
				</div>
			{/if}
		</div>
	{/if}

	{#if showCheckoffSection}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
			<div class="mb-3">
				<h2 class="text-lg font-semibold">{data.checkoff?.title || 'Physical checkoff'}</h2>
				<p class="text-sm text-slate-300">
					{data.checkoff?.directions || 'Demonstrate your work to a mentor for final signoff.'}
				</p>
			</div>
			{#if checklist.length > 0}
				<div class="mb-3 rounded bg-slate-950/60 p-3">
					<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
						Mentor checklist
					</p>
					<ul class="list-disc space-y-1 pl-5 text-sm text-slate-200">
						{#each checklist as item}
							<li>{item}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if resourceLinks.length > 0}
				<div class="mb-3 rounded bg-slate-950/60 p-3">
					<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Resources</p>
					<ul class="space-y-1 text-sm">
						{#each resourceLinks as link}
							<li>
								<a href={link} class="text-yellow-300 underline" target="_blank" rel="noopener noreferrer"
									>{link}</a
								>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<form
				method="POST"
				action="?/saveSubmission"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							checkoffMessage = 'Checkoff submission saved.';
							await invalidateAll();
						}
						if (result.type === 'failure') {
							checkoffMessage = (result.data?.error as string) ?? 'Could not save submission.';
						}
					};
				}}
				class="space-y-3 rounded border border-slate-800 bg-slate-950/60 p-3"
			>
				{#if blockedByMentor}
					<p class="rounded border border-red-700 bg-red-900/20 p-2 text-xs text-red-200">
						This checkoff is currently blocked by a mentor. Resolve the feedback before further review.
					</p>
				{/if}
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-slate-300">What did you complete?</span>
					<textarea
						name="notes"
						rows="3"
						class="rounded bg-slate-800 px-2 py-2"
						placeholder="Describe what you built/demonstrated, tools used, and any issues."
						disabled={blockedByMentor}
					>{data.submission?.notes ?? ''}</textarea>
				</label>
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-slate-300">
						Photo evidence
						{#if data.checkoff?.evidence_mode === 'photo_required'}(required){/if}
						{#if data.checkoff?.evidence_mode === 'photo_optional'}(optional){/if}
					</span>
					<input
						type="file"
						accept="image/*"
						capture="environment"
						multiple
						onchange={onPhotoSelected}
						disabled={blockedByMentor}
					/>
					<input type="hidden" name="photo_data_urls_json" value={JSON.stringify(uploadPreviews)} />
				</label>
				{#if uploadPreviews.length}
					<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
						{#each uploadPreviews as photo, idx}
							<div class="relative">
								<img
									src={photo}
									alt="Checkoff submission preview"
									class="h-24 w-full rounded border border-slate-700 object-cover"
								/>
								<button
									type="button"
									onclick={() => removePhoto(idx)}
									class="absolute right-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] text-red-200"
								>
									Remove
								</button>
							</div>
						{/each}
					</div>
				{/if}
				{#if checkoffMessage}
					<p class="text-xs text-slate-300">{checkoffMessage}</p>
				{/if}
				<button
					class="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
					type="submit"
					disabled={blockedByMentor}
				>
					{blockedByMentor ? 'Blocked by mentor' : 'Save checkoff submission'}
				</button>
			</form>
			{#if data.review}
				<div class="mt-3 rounded border border-slate-700 bg-slate-950/40 p-3 text-sm">
					<p class="font-semibold text-slate-200">Latest mentor feedback</p>
					<p class="mt-1 text-slate-300">{data.review.mentor_notes || 'No notes yet.'}</p>
					{#if data.review.status === 'needs_review'}
						<p class="mt-2 text-xs text-amber-200">
							Mentor requested updates. Your current submission stays saved; update notes/photos and save again.
						</p>
					{/if}
					{#if data.review.status === 'blocked'}
						<p class="mt-2 text-xs text-red-200">
							Mentor has blocked this checkoff pending safety/compliance resolution.
						</p>
					{/if}
					{#if (data.review.checklist_results ?? []).length > 0}
						<ul class="mt-2 list-disc pl-5 text-xs text-slate-300">
							{#each data.review.checklist_results as row}
								<li>{row.item}: {row.passed ? 'passed' : 'needs work'}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if videoDone}
		<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Quiz</h2>
				<span class="text-xs text-slate-400">Passing score: {data.passingScore}%</span>
			</div>
			{#if (data.questions ?? []).length === 0}
				<p class="text-sm text-slate-400">
					No quiz is configured for this module. Ask a mentor to add one.
				</p>
			{:else}
				<Quiz
					questions={data.questions}
					nodeId={data.node.id}
					passingScore={data.passingScore}
					allowSubmit={allowQuizSubmit}
					lockedMessage={quizLockedMessage}
				/>
			{/if}
		</div>
	{/if}

	{#if awaitingMentor}
		<div class="rounded-xl border border-sky-700 bg-sky-900/20 p-4">
			<h2 class="mb-1 text-lg font-semibold">Awaiting mentor checkoff</h2>
			<p class="text-sm text-sky-100">
				Quiz passed{data.cert?.quiz_score != null ? ` (${data.cert.quiz_score}%)` : ''}. Your submission is
				ready for mentor review.
			</p>
		</div>
	{/if}

	{#if completed}
		<div class="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
			<h2 class="mb-1 text-lg font-semibold text-emerald-200">Completed</h2>
			<p class="text-sm text-emerald-100">
				You've finished this module{data.cert?.approved_at
					? ` on ${new Date(data.cert.approved_at).toLocaleDateString()}`
					: ''}.
			</p>
		</div>
	{/if}
</section>
