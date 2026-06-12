// ─── helpers.js — yordamchi funksiyalar ──────────────────────────────────────
console.log('[helpers.js] yuklandi');

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('uz-UZ') + ' ' + (typeof i18nUnit === 'function' ? i18nUnit('som') : "so'm");
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysLeft(stock, du) {
  if (!du || du <= 0) return Infinity;
  return stock / du;
}

function brName(id) {
  return branches.find(b => b.id == id)?.name || '—';
}

function daysColor(days) {
  if (!isFinite(days) || days > 7) return 'var(--teal)';
  if (days <= 2) return 'var(--red)';
  return 'var(--amber)';
}

function statusBadge(days) {
  const KUN  = (typeof i18nUnit === 'function') ? i18nUnit('day') : 'kun';
  const DONE = (typeof i18nUnit === 'function') ? i18nUnit('out') : 'Tugagan';
  if (!isFinite(days)) return `<span class="badge badge-gray">—</span>`;
  if (days <= 0)  return `<span class="badge badge-red"><i class="ti ti-alert-triangle"></i> ${DONE}</span>`;
  if (days <= 2)  return `<span class="badge badge-red"><i class="ti ti-alarm"></i> ${days.toFixed(1)} ${KUN}</span>`;
  if (days <= 7)  return `<span class="badge badge-amber"><i class="ti ti-clock"></i> ${days.toFixed(1)} ${KUN}</span>`;
  if (days <= 14) return `<span class="badge badge-blue">${Math.round(days)} ${KUN}</span>`;
  return `<span class="badge badge-teal">${Math.round(days)} ${KUN}</span>`;
}
