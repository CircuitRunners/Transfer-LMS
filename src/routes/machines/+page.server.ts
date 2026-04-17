import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('machine') ?? '';
	throw redirect(303, `/scan${token ? `?machine=${encodeURIComponent(token)}` : ''}`);
};
