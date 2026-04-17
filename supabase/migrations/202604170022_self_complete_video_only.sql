create or replace function public.transition_certification(
	p_node_id uuid,
	p_new_status public.certification_status,
	p_target_user_id uuid default null,
	p_mentor_notes text default null
)
returns public.certifications
language plpgsql
security definer
set search_path = public
as $$
declare
	v_actor uuid := auth.uid();
	v_actor_role public.app_role;
	v_target_user uuid := coalesce(p_target_user_id, auth.uid());
	v_current public.certifications;
	v_next public.certifications;
	v_has_quiz boolean := false;
	v_has_checkoff boolean := false;
begin
	select role into v_actor_role from public.profiles where id = v_actor;
	if v_actor is null then
		raise exception 'Unauthenticated';
	end if;

	select * into v_current
	from public.certifications
	where user_id = v_target_user and node_id = p_node_id
	for update;

	if not found then
		raise exception 'Certification row missing for user/node';
	end if;

	if p_new_status = 'video_pending' and v_target_user = v_actor then
		if public.are_prereqs_completed(v_target_user, p_node_id) then
			update public.certifications
			set status = 'video_pending'
			where id = v_current.id
			returning * into v_next;
		else
			raise exception 'Prerequisites not completed';
		end if;
	elseif p_new_status = 'quiz_pending' and v_target_user = v_actor then
		update public.certifications
		set status = 'quiz_pending', video_watched_at = now()
		where id = v_current.id
		returning * into v_next;
	elseif p_new_status = 'mentor_checkoff_pending' and v_target_user = v_actor then
		update public.certifications
		set status = 'mentor_checkoff_pending'
		where id = v_current.id
		returning * into v_next;
	elseif p_new_status = 'completed' then
		if v_actor_role not in ('mentor', 'admin') then
			if v_target_user <> v_actor then
				raise exception 'Only mentors/admins can approve';
			end if;
			select exists (
				select 1
				from public.assessments a
				where a.node_id = p_node_id
				  and jsonb_array_length(coalesce(a.questions, '[]'::jsonb)) > 0
			) into v_has_quiz;
			select exists (
				select 1
				from public.node_checkoff_requirements r
				where r.node_id = p_node_id
				  and (
					btrim(coalesce(r.directions, '')) <> ''
					or jsonb_array_length(coalesce(r.mentor_checklist, '[]'::jsonb)) > 0
					or jsonb_array_length(coalesce(r.resource_links, '[]'::jsonb)) > 0
					or r.evidence_mode in ('photo_optional', 'photo_required')
				  )
			) into v_has_checkoff;
			if v_has_quiz or v_has_checkoff then
				raise exception 'Only mentors/admins can approve';
			end if;
			update public.certifications
			set status = 'completed', approved_by = null, approved_at = coalesce(v_current.approved_at, now())
			where id = v_current.id
			returning * into v_next;
		else
			update public.certifications
			set status = 'completed', approved_by = v_actor, approved_at = now()
			where id = v_current.id
			returning * into v_next;
			perform public.log_audit(
				'mentor_checkoff_approved',
				v_target_user,
				p_node_id,
				null,
				jsonb_build_object('notes', coalesce(p_mentor_notes, ''))
			);
		end if;
	elseif p_new_status = 'quiz_pending' and v_target_user <> v_actor then
		if v_actor_role not in ('mentor', 'admin') then
			raise exception 'Only mentors/admins can send back to review';
		end if;
		update public.certifications
		set status = 'quiz_pending', approved_by = null, approved_at = null
		where id = v_current.id
		returning * into v_next;
		perform public.log_audit(
			'mentor_checkoff_rejected',
			v_target_user,
			p_node_id,
			null,
			jsonb_build_object('notes', coalesce(p_mentor_notes, ''))
		);
	else
		raise exception 'Invalid transition requested';
	end if;

	return v_next;
end;
$$;
