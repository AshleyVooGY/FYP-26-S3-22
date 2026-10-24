import { supabase } from "../config/supabaseClient.js";

/**
 * Retrieve every user profile (System Admin only, via RLS).
 */
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, subscription_tier, created_at")
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

/**
 * Set a user's subscription tier (System Admin only; enforced server-side
 * by set_user_subscription_tier, not by this client call).
 */
export async function setUserSubscriptionTier(userId, tier) {
  const { error } = await supabase.rpc("set_user_subscription_tier", { p_user_id: userId, p_tier: tier });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Self-service upgrade: any signed-in user may upgrade their own account
 * from Free to Premium. guard_profile_tier_change() (subscription-tiers.sql)
 * is what actually enforces this is the only direction a non-admin can
 * change their own tier in — this plain table update relies entirely on
 * that server-side check, not on anything client-side.
 */
export async function upgradeMyAccountToPremium() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Please sign in again to upgrade.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_tier: "premium" })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }
}
