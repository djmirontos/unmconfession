import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

type Branding = Pick<Tables<'app_settings'>, 'app_name' | 'tagline' | 'logo_path'>;

const PLACEHOLDER: Branding = {
  app_name: 'UNM Freedom Confessions',
  tagline: 'Say it freely.',
  logo_path: null,
};

async function fetchBranding(): Promise<Branding> {
  // Guests may read only these columns of app_settings.
  const { data, error } = await supabase
    .from('app_settings')
    .select('app_name, tagline, logo_path')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

/** App name, tagline and logo URL. Placeholder until the persisted or fetched value arrives. */
export function useAppSettings() {
  const query = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchBranding,
    staleTime: 5 * 60 * 1000,
    placeholderData: PLACEHOLDER,
  });
  const branding = query.data ?? PLACEHOLDER;
  const logoUrl = branding.logo_path
    ? supabase.storage.from('branding').getPublicUrl(branding.logo_path).data.publicUrl
    : null;

  return {
    appName: branding.app_name,
    tagline: branding.tagline || PLACEHOLDER.tagline,
    logoUrl,
    isPlaceholder: query.isPlaceholderData,
  };
}
