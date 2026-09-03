// Small, dependency-free UI helpers shared across every view.

export function toast(message, type = "") {
  const region = document.getElementById("toast-region");
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function showLoader(show) {
  document.getElementById("global-loader").hidden = !show;
}

export function money(n, symbol = "₹") {
  const v = Number(n || 0);
  return `${symbol}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ---------------------------------------------------------------
// Modal: openModal({ title, bodyHtml, wide, footerButtons, onMount })
// Returns a handle with .close()
// ---------------------------------------------------------------
export function openModal({ title, bodyHtml, wide = false, footerHtml = "", onMount, onClose }) {
  const root = document.getElementById("modal-root");
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal-box ${wide ? "wide" : ""}">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="icon-btn" data-close>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
      </div>
    </div>
  `);
  root.appendChild(overlay);

  function close() {
    overlay.remove();
    if (onClose) onClose();
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-close]").addEventListener("click", close);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  if (onMount) onMount(overlay);
  return { close, root: overlay };
}

export function confirmDialog(message, { title = "Are you sure?", confirmLabel = "Confirm", danger = true } = {}) {
  return new Promise((resolve) => {
    const handle = openModal({
      title,
      bodyHtml: `<p style="margin:0;color:var(--ink-soft)">${escapeHtml(message)}</p>`,
      footerHtml: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${escapeHtml(confirmLabel)}</button>
      `,
      onClose: () => resolve(false)
    });
    handle.root.querySelector("[data-cancel]").addEventListener("click", () => { resolve(false); handle.close(); });
    handle.root.querySelector("[data-ok]").addEventListener("click", () => { resolve(true); handle.close(); });
  });
}

export function badge(text, kind = "grey") {
  return `<span class="badge badge-${kind}">${escapeHtml(text)}</span>`;
}

// Debounce for search inputs
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
