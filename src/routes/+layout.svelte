<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Avatar from '$lib/components/Avatar.svelte';
	import { isAdmin, isMentor, roleBadgeParts } from '$lib/roles';

	let { children, data } = $props();
	const canMentor = $derived(isMentor(data.profile));
	const canAdmin = $derived(isAdmin(data.profile));
	const roleLabel = $derived(roleBadgeParts(data.profile).join(' · '));

	let mobileOpen = $state(false);

	type NavItem = { href: string; label: string; match?: (p: string) => boolean };

	const primary: NavItem[] = [
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/scan', label: 'Scan', match: (p) => p.startsWith('/scan') }
	];

	const mentorNav: NavItem[] = [
		{ href: '/mentor', label: 'Checkoffs queue', match: (p) => p === '/mentor' },
		{
			href: '/mentor/courses',
			label: 'Course management',
			match: (p) => p.startsWith('/mentor/courses')
		},
		{
			href: '/mentor/machines',
			label: 'Machine shop',
			match: (p) => p.startsWith('/mentor/machines')
		},
		{ href: '/roster', label: 'Roster', match: (p) => p.startsWith('/roster') }
	];

	const adminNav: NavItem[] = [
		{ href: '/admin/settings', label: 'Workspace' },
		{ href: '/admin/users', label: 'Users' },
		{ href: '/admin/content', label: 'Content' },
		{ href: '/admin/audit', label: 'Audit log' }
	];

	const isActive = (item: NavItem, p: string) =>
		item.match ? item.match(p) : p === item.href;
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-dvh bg-slate-950 text-slate-100 md:h-screen md:overflow-hidden">
	<!-- Sidebar -->
	<aside
		class={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-700 bg-slate-900 pb-[env(safe-area-inset-bottom)] transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 md:pb-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
	>
		<div class="flex items-center justify-between border-b border-slate-700 px-5 py-5">
			<a href="/dashboard" class="block leading-tight">
				<p class="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Transfer</p>
				<p class="mt-0.5 text-sm font-semibold text-slate-100">{data.orgName}</p>
			</a>
			<button
				type="button"
				class="rounded p-1 text-slate-400 hover:bg-slate-800 md:hidden"
				aria-label="Close navigation"
				onclick={() => (mobileOpen = false)}
			>
				<svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"
					><path
						fill-rule="evenodd"
						d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 1 0-1.06-1.06L10 8.94 5.28 4.22Z"
						clip-rule="evenodd"
					/></svg
				>
			</button>
		</div>

		<nav class="flex-1 overflow-y-auto px-3 py-4 text-sm">
			<p class="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
				Workspace
			</p>
			<ul class="space-y-0.5">
				{#each primary as item (item.href)}
					<li>
						<a
							href={item.href}
							onclick={() => (mobileOpen = false)}
							class={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${isActive(item, page.url.pathname) ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'}`}
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>

			{#if canMentor}
				<p class="mt-6 px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
					Mentor
				</p>
				<ul class="space-y-0.5">
					{#each mentorNav as item (item.href)}
						<li>
							<a
								href={item.href}
								onclick={() => (mobileOpen = false)}
								class={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${isActive(item, page.url.pathname) ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'}`}
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			{#if canAdmin}
				<p class="mt-6 px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
					Admin
				</p>
				<ul class="space-y-0.5">
					{#each adminNav as item (item.href)}
						<li>
							<a
								href={item.href}
								onclick={() => (mobileOpen = false)}
								class={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${isActive(item, page.url.pathname) ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'}`}
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</nav>

		{#if data.user && data.profile}
			<div class="border-t border-slate-700 p-3">
				<a
					href="/profile"
					onclick={() => (mobileOpen = false)}
					class="touch-manipulation flex items-center gap-3 rounded-md p-2 hover:bg-slate-800"
				>
					<Avatar
						name={data.profile.full_name}
						email={data.profile.email}
						url={data.profile.avatar_url}
						size="md"
						ring={isMentor(data.profile)}
						ringClass="ring-sky-400"
					/>
					<div class="min-w-0 flex-1 leading-tight">
						<p class="truncate text-sm font-medium text-slate-100">
							{data.profile.full_name || data.profile.email}
						</p>
						<p class="truncate text-[11px] uppercase tracking-wider text-slate-500">
							{roleLabel}
						</p>
					</div>
				</a>
				<form method="POST" action="/auth/signout" class="mt-2">
					<button
						type="submit"
						class="w-full rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
					>
						Sign out
					</button>
				</form>
			</div>
		{/if}
	</aside>

	<!-- Scrim on mobile -->
	{#if mobileOpen}
		<button
			class="fixed inset-0 z-30 bg-black/30 md:hidden"
			aria-label="Close navigation"
			onclick={() => (mobileOpen = false)}
		></button>
	{/if}

	<div class="flex min-h-dvh min-w-0 flex-1 flex-col md:min-h-0">
		<!-- Mobile top bar -->
		<header
			class="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3 md:hidden"
		>
			<button
				type="button"
				class="rounded p-1 text-slate-300 hover:bg-slate-800"
				aria-label="Open navigation"
				onclick={() => (mobileOpen = true)}
			>
				<svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"
					><path
						fill-rule="evenodd"
						d="M3.75 5.25a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Zm.75 4a.75.75 0 0 0 0 1.5h11a.75.75 0 0 0 0-1.5h-11Z"
						clip-rule="evenodd"
					/></svg
				>
			</button>
			<p class="min-w-0 flex-1 px-3 text-center text-sm font-semibold truncate">Transfer · {data.orgName}</p>
			{#if data.profile}
				<a href="/profile" class="touch-manipulation shrink-0 rounded p-0.5">
					<Avatar
						name={data.profile.full_name}
						email={data.profile.email}
						url={data.profile.avatar_url}
						size="sm"
					/>
				</a>
			{:else}
				<span class="w-8"></span>
			{/if}
		</header>

		<main class="flex-1 bg-slate-950 px-6 py-8 md:min-h-0 md:overflow-y-auto md:px-10 md:py-10">
			<div class="mx-auto w-full max-w-6xl">
				{@render children()}
			</div>
		</main>
	</div>
</div>
