// ─────────────────────────────────────────────
// SIDEBAR TOGGLE
// ─────────────────────────────────────────────
function toggleSidebar(panelId, btn) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const collapsed = panel.classList.toggle('collapsed');
  btn.classList.toggle('collapsed', collapsed);
}

