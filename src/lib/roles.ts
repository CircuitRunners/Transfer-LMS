type RoleLike = {
	role?: string | null;
	base_role?: string | null;
	is_mentor?: boolean | null;
	is_lead?: boolean | null;
};

export const isAdmin = (profile: RoleLike | null | undefined) =>
	!!profile && (profile.base_role === 'admin' || profile.role === 'admin');

export const isMentor = (profile: RoleLike | null | undefined) =>
	!!profile && (!!profile.is_mentor || profile.role === 'mentor');

export const isLead = (profile: RoleLike | null | undefined) =>
	!!profile && (!!profile.is_lead || profile.role === 'student_lead');

export const roleBadgeParts = (profile: RoleLike | null | undefined) => {
	if (!profile) return [];
	const base =
		profile.base_role === 'admin'
			? 'admin'
			: 'member';
	const extras: string[] = [];
	if (isMentor(profile)) extras.push('mentor');
	if (isLead(profile)) extras.push('lead');
	return [base, ...extras];
};
