<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children, data } = $props();
	const role = $derived(data.profile?.role ?? 'student');
	const canMentor = $derived(role === 'mentor' || role === 'admin');
	const canAdmin = $derived(role === 'admin');
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-100">
	<header class="border-b border-slate-800 bg-slate-900/50">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<a href="/" class="font-semibold">FRC Training LMS</a>
			<nav class="flex items-center gap-4 text-sm">
				<a href="/dashboard" class={page.url.pathname === '/dashboard' ? 'text-yellow-300' : ''}
					>Dashboard</a
				>
				<a href="/teams" class={page.url.pathname.startsWith('/teams') ? 'text-yellow-300' : ''}
					>Teams</a
				>
				{#if canMentor}
					<a
						href="/mentor"
						class={page.url.pathname === '/mentor' ||
						page.url.pathname === '/mentor/scan'
							? 'text-yellow-300'
							: ''}>Mentor</a
					>
					<a
						href="/mentor/courses"
						class={page.url.pathname.startsWith('/mentor/courses') ? 'text-yellow-300' : ''}
						>Courses</a
					>
					<a
						href="/mentor/machines"
						class={page.url.pathname.startsWith('/mentor/machines') ? 'text-yellow-300' : ''}
						>Machine Shop</a
					>
				{/if}
				{#if canMentor}
					<a href="/roster" class={page.url.pathname === '/roster' ? 'text-yellow-300' : ''}
						>Roster</a
					>
				{/if}
				<a href="/passport" class={page.url.pathname === '/passport' ? 'text-yellow-300' : ''}
					>Passport</a
				>
				{#if data.session}
					<form method="POST" action="/auth/signout">
						<button class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600" type="submit"
							>Sign out</button
						>
					</form>
				{/if}
			</nav>
		</div>
	</header>
	<main class="mx-auto max-w-6xl p-4">{@render children()}</main>
</div>
