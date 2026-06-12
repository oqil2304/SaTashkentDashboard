// ─── ui.js — modal va toast ───────────────────────────────────────────────────
console.log('[ui.js] yuklandi');

function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = { success: 'ti-check', error: 'ti-alert-circle', info: 'ti-info-circle' }[type] || 'ti-info-circle';
  el.innerHTML = `<i class="ti ${icon}"></i><span>${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay') || e === true)
    document.getElementById('modal-overlay').classList.remove('open');
}

function showError(msg) {
  const c = document.getElementById('content');
  if (!c) return;
  c.innerHTML = `
    <div style="text-align:center;padding:60px 20px">
      <i class="ti ti-alert-triangle" style="font-size:48px;color:var(--red)"></i>
      <div style="font-size:16px;font-weight:700;margin-top:12px;color:#0f172a">Xatolik yuz berdi</div>
      <div style="font-size:13px;margin-top:6px;color:#64748b;max-width:400px;margin-left:auto;margin-right:auto">${esc(msg)}</div>
      <button class="btn btn-primary" style="margin-top:18px" onclick="location.reload()">
        <i class="ti ti-refresh"></i> Qayta urinish
      </button>
    </div>`;
}

function showLoading() {
  const c = document.getElementById('content');
  if (c) c.innerHTML = `<div class="loading-state"><i class="ti ti-loader-2 spin"></i><span>Yuklanmoqda...</span></div>`;
}
