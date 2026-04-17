// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient;
			safeGetSession: () => Promise<{
				session: import('@supabase/supabase-js').Session | null;
				user: import('@supabase/supabase-js').User | null;
				profile: {
					id: string;
					email: string;
					full_name: string;
					role: 'student' | 'student_lead' | 'mentor' | 'admin';
					subteam_id: string | null;
					bio: string;
					avatar_url: string;
				} | null;
			}>;
		}
		interface PageData {
			session: import('@supabase/supabase-js').Session | null;
			user: import('@supabase/supabase-js').User | null;
			profile: {
				id: string;
				email: string;
				full_name: string;
				role: 'student' | 'student_lead' | 'mentor' | 'admin';
				subteam_id: string | null;
				bio: string;
				avatar_url: string;
			} | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
