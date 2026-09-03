// Tiny shared state object. No framework needed for an app this size.
export const state = {
  session: null,
  authUser: null,     // supabase auth user
  profile: null,       // row from app_users
  shop: null,           // row from shops
  settings: null,
};

export function isAdmin() {
  return state.profile?.role === "admin";
}

export function shopId() {
  return state.profile?.shop_id;
}

export function currency() {
  return state.shop?.currency || "₹";
}
