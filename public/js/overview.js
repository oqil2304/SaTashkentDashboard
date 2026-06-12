// ─── overview.js — Umumiy ko'rinish bo'limi ───────────────────────────────────
console.log('[overview.js] yuklandi');

function alertProducts() {
  return products.filter(p => p.daily_usage > 0 && daysLeft(p.current_stock, p.daily_usage) <= 2);
}

function updateAlertBadge() {
  const cnt = alertProducts().length;
  const badge = document.getElementById('alert-count');
  if (!badge) return;
  badge.textContent = cnt;
  badge.style.display = cnt > 0 ? 'flex' : 'none';
}

function renderOverview(c) {
  console.log('[overview.js] renderOverview chaqirildi, products:', products.length);

  const alerts     = alertProducts();
  const urgentCount = alerts.length;
  const soonCount   = products.filter(p => {
    const d = daysLeft(p.current_stock, p.daily_usage);
    return d > 2 && d <= 7;
  }).length;
  const lowStock = products.filter(p => p.daily_usage > 0 && daysLeft(p.current_stock, p.daily_usage) <= 7);

  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthlySpend = purchases
    .filter(p => (p.purchase_date || '').startsWith(ym))
    .reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon teal"><i class="ti ti-box"></i></div>
        <div><div class="stat-label">Jami mahsulot</div><div class="stat-value">${products.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="ti ti-alarm"></i></div>
        <div><div class="stat-label">Shoshilinch (≤2 kun)</div>
          <div class="stat-value" style="color:var(--red)">${urgentCount}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber"><i class="ti ti-clock"></i></div>
        <div><div class="stat-label">Kam qoldi (≤7 kun)</div>
          <div class="stat-value" style="color:var(--amber)">${soonCount}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Oylik xarajat</div>
          <div class="stat-value" style="font-size:18px">${fmtMoney(monthlySpend)}</div></div>
      </div>
    </div>

    ${urgentCount ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px">
      <i class="ti ti-bell-ringing" style="font-size:22px;color:var(--red);flex-shrink:0;margin-top:2px"></i>
      <div>
        <div style="font-size:14px;font-weight:700;color:#991b1b;margin-bottom:4px">⚠️ ${urgentCount} ta mahsulot tugab qolmoqda!</div>
        <div style="font-size:12px;color:#b91c1c">
          ${alerts.map(a => {
            const d = daysLeft(a.current_stock, a.daily_usage);
            return `<b>${esc(a.name)}</b> (${esc(brName(a.branch_id))}) — ${d <= 0 ? 'Tugagan' : d.toFixed(1) + ' kun'}`;
          }).join(' · ')}
        </div>
      </div>
    </div>` : ''}

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:15px;font-weight:700">
        <i class="ti ti-clock" style="color:#94a3b8;margin-right:6px"></i>Kam qolgan mahsulotlar (≤7 kun)
      </div>
      <button class="btn btn-primary btn-sm admin-only" onclick="openAddProduct()"><i class="ti ti-plus"></i>Qoʻshish</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Mahsulot</th><th>Filial</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th><th></th>
          </tr></thead>
          <tbody>
            ${lowStock.length ? lowStock.map(p => {
              const d = daysLeft(p.current_stock, p.daily_usage);
              return `<tr>
                <td>
                  <div style="font-weight:600">${esc(p.name)}</div>
                  ${p.category ? `<div style="font-size:11px;color:#94a3b8">${esc(p.category)}</div>` : ''}
                </td>
                <td><span class="badge badge-gray">${esc(p.branch_name || brName(p.branch_id))}</span></td>
                <td style="font-weight:600;color:${daysColor(d)}">${p.current_stock} ${esc(p.unit)}</td>
                <td style="color:#64748b">${p.daily_usage} ${esc(p.unit)}/kun</td>
                <td style="font-weight:700;color:${daysColor(d)}">${isFinite(d) ? d.toFixed(1) + ' kun' : '—'}</td>
                <td>${statusBadge(d)}</td>
                <td>
                  <button class="btn btn-sm btn-primary admin-only" onclick="openAddPurchase(${p.id})">
                    <i class="ti ti-shopping-cart"></i>Sotib olish
                  </button>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="7">
              <div class="empty-state"><i class="ti ti-mood-happy"></i><p>Barcha mahsulotlar yetarli!</p></div>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}
