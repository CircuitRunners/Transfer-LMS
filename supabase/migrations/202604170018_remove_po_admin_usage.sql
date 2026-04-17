update public.profiles
set base_role = 'member'::public.app_base_role
where base_role = 'po_admin'::public.app_base_role;
