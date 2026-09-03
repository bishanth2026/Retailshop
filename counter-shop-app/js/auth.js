import { supabase } from "./supa.js";
import { state } from "./state.js";
import { toast, showLoader } from "./ui.js";

const DEFAULT_CATEGORIES = ["Fancy", "Footwear", "Cosmetics", "Gifts", "Stationery", "Toys", "Accessories", "Other"];
const DEFAULT_EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salary", "Transport", "Packing", "Repairs", "Internet", "Other"];

export async function loadProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { state.session = null; return false; }
  state.session = session;
  state.authUser = session.user;

  const { data: profile, error } = await supabase
    .from("app_users").select("*").eq("id", session.user.id).maybeSingle();
  if (error || !profile) {
    // Auth account exists but no shop profile yet — treat as logged out of the app.
    return false;
  }
  state.profile = profile;

  const { data: shop } = await supabase.from("shops").select("*").eq("id", profile.shop_id).maybeSingle();
  state.shop = shop;

  const { data: settings } = await supabase.from("settings").select("*").eq("shop_id", profile.shop_id).maybeSingle();
  state.settings = settings;

  return true;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const ok = await loadProfile();
  if (!ok) throw new Error("This login has no shop set up yet. Please use 'Create the owner account' instead.");
  if (state.profile.active === false) {
    await supabase.auth.signOut();
    state.session = null; state.profile = null;
    throw new Error("This account has been disabled. Contact your shop admin.");
  }
  return true;
}

export async function signUpOwner({ shopName, fullName, email, password, kind = "owner", joinShopId = "" }) {
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
  if (signUpErr) throw signUpErr;

  // If email confirmation is required, there is no session yet.
  if (!signUpData.session) {
    throw new Error("Account created. Please check your email to confirm, then sign in.");
  }
  state.session = signUpData.session;
  state.authUser = signUpData.user;

  if (kind === "cashier") {
    if (!joinShopId.trim()) throw new Error("Enter the Shop ID your owner gave you.");
    const { data: profile, error: userErr } = await supabase
      .from("app_users")
      .insert({ id: signUpData.user.id, shop_id: joinShopId.trim(), full_name: fullName, role: "cashier" })
      .select().single();
    if (userErr) throw new Error("Couldn't join that shop — check the Shop ID and try again.");
    const { data: shop } = await supabase.from("shops").select("*").eq("id", joinShopId.trim()).maybeSingle();
    state.profile = profile;
    state.shop = shop;
    return true;
  }

  const { data: shop, error: shopErr } = await supabase
    .from("shops").insert({ name: shopName }).select().single();
  if (shopErr) throw shopErr;

  const { data: profile, error: userErr } = await supabase
    .from("app_users")
    .insert({ id: signUpData.user.id, shop_id: shop.id, full_name: fullName, role: "admin" })
    .select().single();
  if (userErr) throw userErr;

  await supabase.from("settings").insert({ shop_id: shop.id });
  await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((name) => ({ shop_id: shop.id, name })));
  await supabase.from("expense_categories").insert(DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ shop_id: shop.id, name })));

  state.profile = profile;
  state.shop = shop;
  return true;
}

export async function signOut() {
  showLoader(true);
  await supabase.auth.signOut();
  state.session = null; state.authUser = null; state.profile = null; state.shop = null;
  showLoader(false);
  location.reload();
}
