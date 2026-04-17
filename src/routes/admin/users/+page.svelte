<script lang="ts">
	let { data, form } = $props();
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">User Role Management</h1>
	<p class="text-sm text-neutral-500">Update workspace roles for mentors/admins/students.</p>

	{#if form?.error}
		<p class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{form.error}</p>
	{/if}

	<div class="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
		<table class="min-w-full text-sm">
			<thead class="bg-neutral-100 text-left text-xs uppercase text-neutral-500">
				<tr>
					<th class="px-3 py-2">Name</th>
					<th class="px-3 py-2">Email</th>
					<th class="px-3 py-2">Role</th>
					<th class="px-3 py-2 text-right">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.id)}
					<tr class="border-t border-neutral-200">
						<td class="px-3 py-2">{u.full_name || '—'}</td>
						<td class="px-3 py-2 text-neutral-500">{u.email}</td>
						<td class="px-3 py-2">
							<form method="POST" action="?/setRole" class="flex items-center gap-2">
								<input type="hidden" name="user_id" value={u.id} />
								<select class="rounded bg-neutral-100 px-2 py-1" name="role" value={u.role}>
									<option value="student">student</option>
									<option value="student_lead">student_lead</option>
									<option value="mentor">mentor</option>
									<option value="admin">admin</option>
								</select>
								<button class="rounded border border-neutral-200 px-2 py-1 text-xs">Save</button>
							</form>
						</td>
						<td class="px-3 py-2 text-right text-xs text-neutral-400">{u.id}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
