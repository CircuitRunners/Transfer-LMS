<script lang="ts">
	let { data, form } = $props();
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">User Role Management</h1>
	<p class="text-sm text-slate-400">Update workspace roles for mentors/admins/students.</p>

	{#if form?.error}
		<p class="rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-200">{form.error}</p>
	{/if}

	<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
		<table class="min-w-full text-sm">
			<thead class="bg-slate-800 text-left text-xs uppercase text-slate-400">
				<tr>
					<th class="px-3 py-2">Name</th>
					<th class="px-3 py-2">Email</th>
					<th class="px-3 py-2">Role</th>
					<th class="px-3 py-2 text-right">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.id)}
					<tr class="border-t border-slate-800">
						<td class="px-3 py-2">{u.full_name || '—'}</td>
						<td class="px-3 py-2 text-slate-400">{u.email}</td>
						<td class="px-3 py-2">
							<form method="POST" action="?/setRole" class="flex items-center gap-2">
								<input type="hidden" name="user_id" value={u.id} />
								<select class="rounded bg-slate-800 px-2 py-1" name="role" value={u.role}>
									<option value="student">student</option>
									<option value="student_lead">student_lead</option>
									<option value="mentor">mentor</option>
									<option value="admin">admin</option>
								</select>
								<button class="rounded border border-slate-800 px-2 py-1 text-xs">Save</button>
							</form>
						</td>
						<td class="px-3 py-2 text-right text-xs text-slate-500">{u.id}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
