import { supabase } from '../config/supabaseClient.js';
import { validateDisplayName, isDisplayNameAvailable, DISPLAY_NAME_TAKEN } from './accountSettingsService.js?v=unique-display-name-20261104';

export async function registerAccount(email, password, displayName, tier, emailRedirectTo) {
  try {
    const name = validateDisplayName(displayName);
    if (!await isDisplayNameAvailable(name)) throw new Error(DISPLAY_NAME_TAKEN);
    const result = await supabase.auth.signUp({
      email, password,
      options: {
        data: { display_name: name, requested_tier: tier === 'premium' ? 'premium' : 'free' },
        emailRedirectTo
      }
    });
    // Auth can hide trigger errors behind a generic database error. Recheck
    // only failed requests so a concurrent signup gets a useful name message.
    if (result.error) {
      try {
        if (!await isDisplayNameAvailable(name)) return { data: null, error: new Error(DISPLAY_NAME_TAKEN) };
      } catch { /* Keep the original Auth error if the follow-up lookup fails. */ }
    }
    return result;
  } catch (error) {
    return { data: null, error };
  }
}
