<script lang="ts">
	let { data } = $props();
	let expandedUserId = $state<string | null>(null);
	let expandedCourseKey = $state<string | null>(null);

	const labelFor = (status: string) =>
		({
			available: 'Not started',
			video_pending: 'Watching',
			quiz_pending: 'Ready for quiz',
			mentor_checkoff_pending: 'Awaiting mentor checkoff',
			completed: 'Completed'
		})[status] ?? status;

	const photosFor = (submission: any): string[] => {
		if (Array.isArray(submission?.photo_data_urls) && submission.photo_data_urls.length > 0) {
			return submission.photo_data_urls;
		}
		if (submission?.photo_data_url) return [submission.photo_data_url];
		return [];
	};

	const formatAnswer = (text: string) => (text?.trim() ? text : 'No answer provided');
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Roster Dashboard</h1>
	<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
		<h2 class="font-semibold">Bottlenecks</h2>
		<ul class="mt-2 list-disc pl-5 text-sm text-slate-300">
			{#each data.bottlenecks as b}
				<li>{b.node}: {b.count} waiting</li>
			{/each}
		</ul>
	</div>
	<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
		<table class="min-w-full text-sm">
			<thead class="bg-slate-800 text-left">
				<tr>
					<th class="p-2">Name</th>
					<th class="p-2">Role</th>
					<th class="p-2">Progress</th>
					<th class="p-2">Pending Checkoffs</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row}
					<tr class="border-t border-slate-800">
						<td class="p-2">
							<div class="flex items-center gap-2">
								<button
									class="rounded border border-slate-700 px-2 py-0.5 text-xs"
									onclick={() => (expandedUserId = expandedUserId === row.id ? null : row.id)}
								>
									{expandedUserId === row.id ? 'Hide' : 'View'}
								</button>
								<span>{row.full_name || row.email}</span>
							</div>
						</td>
						<td class="p-2">{row.role}</td>
						<td class="p-2">{row.progressPercent}%</td>
						<td class="p-2">{row.pendingCheckoffs}</td>
					</tr>
					{#if expandedUserId === row.id}
						<tr class="border-t border-slate-800 bg-slate-950/40">
							<td colspan="4" class="p-3">
								<div class="rounded border border-slate-800 bg-slate-900 p-3">
									<h3 class="mb-2 font-semibold">Courses Passed / In Progress</h3>
									<ul class="space-y-2 text-xs text-slate-300">
										{#each row.courses as c}
											{@const courseKey = `${row.id}:${c.node_id}`}
											<li class="rounded border border-slate-800 p-2">
												<div class="flex items-center justify-between gap-2">
													<div>
														<p class="font-medium">{c.title}</p>
														<p class="text-slate-400">{c.slug}</p>
													</div>
													<div class="flex items-center gap-2">
														<span class="rounded bg-slate-800 px-2 py-0.5">{labelFor(c.status)}</span>
														<button
															class="rounded border border-slate-700 px-2 py-0.5"
															onclick={() =>
																(expandedCourseKey = expandedCourseKey === courseKey ? null : courseKey)}
														>
															{expandedCourseKey === courseKey ? 'Hide details' : 'View details'}
														</button>
													</div>
												</div>
												{#if expandedCourseKey === courseKey}
													<div class="mt-2 grid gap-2 md:grid-cols-2">
														<div class="rounded border border-slate-800 bg-slate-950/60 p-2">
															<p class="font-semibold">Checkoff Submission</p>
															<p class="mt-1 whitespace-pre-wrap text-slate-300">
																{c.submission?.notes || 'No notes submitted.'}
															</p>
															{#if photosFor(c.submission).length}
																<div class="mt-2 grid grid-cols-3 gap-2">
																	{#each photosFor(c.submission) as photo}
																		<a href={photo} target="_blank" rel="noopener noreferrer">
																			<img src={photo} alt="Submitted evidence" class="h-16 w-full rounded object-cover" />
																		</a>
																	{/each}
																</div>
															{/if}
														</div>
														<div class="rounded border border-slate-800 bg-slate-950/60 p-2">
															<p class="font-semibold">Quiz Answers</p>
															<ul class="mt-1 space-y-2">
																{#each c.quizAttempts as a}
																	<li class="rounded border border-slate-800 p-2">
																		<p class="text-slate-400">
																			{new Date(a.created_at).toLocaleString()} · {a.score}% · {a.passed
																				? 'passed'
																				: 'failed'}
																		</p>
																		<ul class="mt-1 space-y-1">
																			{#each a.formattedAnswers as ans}
																				<li class="rounded bg-slate-950 p-2">
																					<p class="text-slate-400">{ans.label}</p>
																					<p class="text-slate-200">{formatAnswer(ans.answerText)}</p>
																				</li>
																			{:else}
																				<li class="rounded bg-slate-950 p-2 text-slate-400">No answers saved for this attempt.</li>
																			{/each}
																		</ul>
																	</li>
																{:else}
																	<li>No quiz attempts for this course.</li>
																{/each}
															</ul>
														</div>
													</div>
												{/if}
											</li>
										{:else}
											<li>No passed or in-progress courses yet.</li>
										{/each}
									</ul>
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
</section>
