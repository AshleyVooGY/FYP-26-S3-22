import { supabase } from "../config/supabaseClient.js";

/**
 * Retrieve every user profile (System Admin only, via RLS).
 */
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Set a user's role (System Admin only, via RLS).
 */
export async function setUserRole(userId, role) {
  const { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });

  if (error) {
    throw new Error(error.message);
  }
}
