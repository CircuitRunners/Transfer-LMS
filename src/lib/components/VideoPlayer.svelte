<script lang="ts">
	import { onMount } from 'svelte';

	let {
		videoId,
		onCompleted,
		startSeconds = 0,
		endSeconds = null
	}: {
		videoId: string;
		onCompleted: () => Promise<void>;
		startSeconds?: number;
		endSeconds?: number | null;
	} = $props();
	const iframeId = $derived(`youtube-${videoId}`);
	let completed = false;

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		document.body.appendChild(script);
		let tickHandle: ReturnType<typeof setInterval> | null = null;

		const completeOnce = async () => {
			if (completed) return;
			completed = true;
			if (tickHandle) {
				clearInterval(tickHandle);
				tickHandle = null;
			}
			await onCompleted();
		};

		// @ts-expect-error runtime global from YouTube
		window.onYouTubeIframeAPIReady = () => {
			// @ts-expect-error runtime global from YouTube
			const player = new window.YT.Player(iframeId, {
				playerVars: {
					start: Math.max(0, Math.trunc(startSeconds || 0))
				},
				events: {
					onStateChange: async (event: { data: number }) => {
						// @ts-expect-error runtime global from YouTube
						if (event.data === window.YT.PlayerState.ENDED) {
							await completeOnce();
							return;
						}
						if (
							endSeconds != null &&
							// @ts-expect-error runtime global from YouTube
							event.data === window.YT.PlayerState.PLAYING &&
							!tickHandle
						) {
							tickHandle = setInterval(async () => {
								try {
									const current = Number(player.getCurrentTime?.() ?? 0);
									if (current >= Number(endSeconds)) {
										player.pauseVideo?.();
										await completeOnce();
									}
								} catch {
									// Ignore timer sampling errors.
								}
							}, 700);
						}
					}
				}
			});
		};

		return () => {
			if (tickHandle) clearInterval(tickHandle);
		};
	});
</script>

<iframe
	id={iframeId}
	class="aspect-video w-full rounded-lg"
	src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&start=${Math.max(0, Math.trunc(startSeconds || 0))}`}
	title="Training video"
	allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
	referrerpolicy="strict-origin-when-cross-origin"
	allowfullscreen
></iframe>
