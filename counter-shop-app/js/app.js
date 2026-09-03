import { supabase } from "./supa.js";
import { state, isAdmin } from "./state.js";
import { signIn, signUpOwner, signOut, loadProfile } from "./auth.js";
import { toast, showLoader } from "./ui.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderProducts } from "./views/products.js";
import { renderStock } from "./views/stock.js";
import { renderPurchases } from "./views/purchases.js";
import { renderSales } from "./views/sales.js";
import { renderSalesHistory } from "./views/sales-history.js";
import { renderCustomers } from "./views/customers.js";
import { renderSuppliers } from "./views/suppliers.js";
import { renderExpenses } from "./views/expenses.js";
import { renderReports } from "./views/reports.js";
import { renderSettings } from "./views/settings.js";

const ICONS = {
  dashboard: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="11" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="15" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>`,
  products: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 8l-9-5-9 5 9 5 9-5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 8v8l9 5 9-5V8" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  stock: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  sales: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/><path d="M2 3h2l2.2 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  history: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 4v5h5M12 8v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  purchases: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20.5 8H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12V8m-2 2h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  customers: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 5.5c1.8.4 3 1.9 3 3.7 0 1.6-1 3-2.4 3.5M18.5 14.2c2 .6 3 2.6 3 5.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  suppliers: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="9" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M7 9V6a2 2 0 0 1 2-2h1M15 13h4a2 2 0 0 1 2 2v4h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  expenses: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M17 7c0-2-2-3-5-3s-5 1.3-5 3.2S8.5 10 12 10.5s5 1.3 5 3.3-2 3.2-5 3.2-5-1-5-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  reports: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  settings: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const ROUTES = [
  { hash: "dashboard", label: "Dashboard", icon: "dashboard", roles: ["admin", "cashier"], render: renderDashboard },
  { hash: "sales", label: "Sales / Billing", icon: "sales", roles: ["admin", "cashier"], render: renderSales },
  { hash: "sales-history", label: "Sales History", icon: "history", roles: ["admin", "cashier"], render: renderSalesHistory },
  { hash: "products", label: "Products", icon: "products", roles: ["admin"], render: renderProducts },
  { hash: "stock", label: "Stock", icon: "stock", roles: ["admin"], render: renderStock },
  { hash: "purchases", label: "Purchases", icon: "purchases", roles: ["admin"], render: renderPurchases },
  { hash: "customers", label: "Customers", icon: "customers", roles: ["admin", "cashier"], render: renderCustomers },
  { hash: "suppliers", label: "Suppliers", icon: "suppliers", roles: ["admin"], render: renderSuppliers },
  { hash: "expenses", label: "Expenses", icon: "expenses", roles: ["admin"], render: renderExpenses },
  { hash: "reports", label: "Reports", icon: "reports", roles: ["admin"], render: renderReports },
  { hash: "settings", label: "Settings", icon: "settings", roles: ["admin"], render: renderSettings },
];

function visibleRoutes() {
  const role = state.profile?.role || "cashier";
  return ROUTES.filter(r => r.roles.includes(role));
}

function buildNav() {
  const nav = document.getElementById("nav-menu");
  nav.innerHTML = "";
  for (const r of visibleRoutes()) {
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.hash = r.hash;
    btn.innerHTML = `${ICONS[r.icon]}<span>${r.label}</span>`;
    btn.addEventListener("click", () => { location.hash = "#/" + r.hash; closeSidebarMobile(); });
    nav.appendChild(btn);
  }
}

function currentRoute() {
  const hash = (location.hash || "#/dashboard").replace("#/", "");
  return visibleRoutes().find(r => r.hash === hash) || visibleRoutes()[0];
}

async function router() {
  const route = currentRoute();
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.hash === route.hash));
  document.getElementById("page-title").textContent = route.label;
  const content = document.getElementById("content");
  content.innerHTML = "";
  try {
    showLoader(true);
    await route.render(content);
  } catch (err) {
    console.error(err);
    content.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><p>Couldn't load this page.<br><span class="mono" style="font-size:12px">${(err.message || err).toString()}</span></p></div>`;
  } finally {
    showLoader(false);
  }
}

window.addEventListener("hashchange", router);

function closeSidebarMobile() {
  document.getElementById("sidebar").classList.remove("open");
  document.querySelector(".sidebar-scrim")?.classList.remove("show");
}

function wireShell() {
  buildNav();
  document.getElementById("user-name").textContent = state.profile.full_name;
  document.getElementById("user-role").textContent = state.profile.role;
  document.getElementById("user-avatar").textContent = state.profile.full_name.slice(0, 1).toUpperCase();
  document.getElementById("shop-name-label").textContent = state.shop?.name || "Counter";
  document.getElementById("logout-btn").addEventListener("click", signOut);
  document.getElementById("quick-sale-btn").addEventListener("click", () => { location.hash = "#/sales"; });

  const scrim = document.createElement("div");
  scrim.className = "sidebar-scrim";
  document.body.appendChild(scrim);
  scrim.addEventListener("click", closeSidebarMobile);
  document.getElementById("menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    scrim.classList.add("show");
  });
}

async function boot() {
  showLoader(true);
  const ok = await loadProfile();
  showLoader(false);
  if (ok) {
    document.getElementById("login-screen").hidden = true;
    document.getElementById("app-shell").hidden = false;
    wireShell();
    router();
  } else {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("app-shell").hidden = true;
  }
}

// ---------------- login screen wiring ----------------
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("login-error");
  errBox.hidden = true;
  const btn = document.getElementById("login-submit");
  btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span>`;
  try {
    await signIn(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
    await boot();
  } catch (err) {
    errBox.textContent = err.message || "Couldn't sign in.";
    errBox.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Sign in";
  }
});

document.getElementById("show-signup").addEventListener("click", () => {
  document.getElementById("login-form").hidden = true;
  document.getElementById("show-signup").hidden = true;
  document.getElementById("signup-form").hidden = false;
});
document.getElementById("show-login").addEventListener("click", () => {
  document.getElementById("signup-form").hidden = true;
  document.getElementById("login-form").hidden = false;
  document.getElementById("show-signup").hidden = false;
});
document.getElementById("signup-kind").addEventListener("change", (e) => {
  const isCashier = e.target.value === "cashier";
  document.getElementById("signup-shop-field").hidden = isCashier;
  document.getElementById("signup-shopid-field").hidden = !isCashier;
  document.getElementById("signup-shop").required = !isCashier;
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("signup-error");
  errBox.hidden = true;
  const btn = document.getElementById("signup-submit");
  btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span>`;
  try {
    await signUpOwner({
      kind: document.getElementById("signup-kind").value,
      shopName: document.getElementById("signup-shop").value.trim(),
      joinShopId: document.getElementById("signup-shopid").value.trim(),
      fullName: document.getElementById("signup-name").value.trim(),
      email: document.getElementById("signup-email").value.trim(),
      password: document.getElementById("signup-password").value
    });
    toast("Welcome! Your shop is ready.", "success");
    await boot();
  } catch (err) {
    errBox.textContent = err.message || "Couldn't create the account.";
    errBox.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Create account & sign in";
  }
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("app-shell").hidden = true;
  }
});

boot();
