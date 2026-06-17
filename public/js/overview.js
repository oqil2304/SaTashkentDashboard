// ─── overview.js — Umumiy ko'rinish bo'limi ───────────────────────────────────
console.log('[overview.js] yuklandi');

let overviewFilter = 'all'; // qaysi karta tanlangan: all | urgent | low7 | spend

// Aktiv (jarayondagi) buyurtmasi bor mahsulotlar — bular qayta eslatilmaydi
function _orderedProductIds() {
  const ids = new Set();
  (purchases || []).forEach(p => {
    if (p._type && p.product_id) ids.add(Number(p.product_id));
  });
  return ids;
}

// Rasxod (sarflanish) tarixi bor mahsulotlar — kamida bir marta ishlatilgan
function _consumedProductIds() {
  const ids = new Set();
  (consumptions || []).forEach(co => {
    if (co.product_id) ids.add(Number(co.product_id));
  });
  return ids;
}

// Tugagan mahsulotlar: ombor 0 yoki undan kam BO'LSA va u kamida bir marta
// sarflangan (rasxod) bo'lsa. Yangi qo'shilgan, hali ishlatilmagan tovar "tugagan" hisoblanmaydi.
// Allaqachon buyurtma qilingan (jarayonda) mahsulotlar ham ko'rsatilmaydi.
function finishedProducts() {
  const ordered  = _orderedProductIds();
  const consumed = _consumedProductIds();
  return products.filter(p =>
    (p.current_stock || 0) <= 0 &&
    consumed.has(Number(p.id)) &&
    !ordered.has(Number(p.id)));
}

// Shoshilinch mahsulotlar (≤2 kun qolgan — sarfi ma'lum bo'lsa)
function urgentProducts() {
  const ordered = _orderedProductIds();
  return products.filter(p => {
    const d = daysLeft(p.current_stock, p.daily_usage);
    return p.daily_usage > 0 && d > 0 && d <= 2 && !ordered.has(Number(p.id));
  });
}

// Kam qolgan mahsulotlar (≤7 kun — sarfi ma'lum bo'lsa)
function lowStockProducts() {
  const ordered = _orderedProductIds();
  return products.filter(p => {
    const d = daysLeft(p.current_stock, p.daily_usage);
    return p.daily_usage > 0 && d > 0 && d <= 7 && !ordered.has(Number(p.id));
  });
}

// Qo'ng'iroq belgisi — tugagan + shoshilinch
function alertProducts() {
  const finished = finishedProducts();
  const urgent   = urgentProducts().filter(p => !finished.find(f => f.id === p.id));
  return [...finished, ...urgent];
}

let _lastAlertCount = null; // oldingi ogohlantirishlar soni (ovoz uchun)

// Qo'ng'iroq ovozi — Web Audio bilan (tashqi fayl kerak emas)
function playBellSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // Ikki tonli "ding-ding" jiringlash
    [[880, 0], [1175, 0.16]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain); gain.connect(ctx.destination);
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.42);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch (_) {}
}

function updateAlertBadge() {
  const cnt = alertProducts().length;
  const badge = document.getElementById('alert-count');
  if (!badge) return;
  badge.textContent = cnt;
  badge.style.display = cnt > 0 ? 'flex' : 'none';
  // Yangi ogohlantirish kelganda — qo'ng'iroqni jiringlatish va silkitish
  if (_lastAlertCount !== null && cnt > _lastAlertCount) {
    playBellSound();
    const btn = document.getElementById('alert-btn');
    if (btn) {
      btn.classList.remove('ring');
      void btn.offsetWidth;
      btn.classList.add('ring');
      setTimeout(() => btn.classList.remove('ring'), 900);
    }
  }
  _lastAlertCount = cnt;
}

function renderOverview(c) {
  console.log('[overview.js] renderOverview chaqirildi, products:', products.length);

  const finished    = finishedProducts();
  const urgentCount = urgentProducts().length;
  const lowStock    = lowStockProducts();

  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthlySpend = purchases
    .filter(p => (p.purchase_date || '').startsWith(ym))
    .reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  const A = f => overviewFilter === f ? ' active' : '';

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card clickable${A('all')}" onclick="setOverviewFilter('all')">
        <div class="stat-icon teal"><i class="ti ti-box"></i></div>
        <div><div class="stat-label">Jami mahsulot</div><div class="stat-value">${products.length}</div></div>
      </div>
      <div class="stat-card clickable${A('urgent')}" onclick="setOverviewFilter('urgent')">
        <div class="stat-icon red"><i class="ti ti-alarm"></i></div>
        <div><div class="stat-label">Shoshilinch (≤2 kun)</div>
          <div class="stat-value" style="color:var(--red)">${urgentCount}</div></div>
      </div>
      <div class="stat-card clickable${A('low7')}" onclick="setOverviewFilter('low7')">
        <div class="stat-icon amber"><i class="ti ti-clock"></i></div>
        <div><div class="stat-label">Kam qoldi (≤7 kun)</div>
          <div class="stat-value" style="color:var(--amber)">${lowStock.length}</div></div>
      </div>
      <div class="stat-card clickable${A('spend')}" onclick="setOverviewFilter('spend')">
        <div class="stat-icon blue"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Oylik xarajat</div>
          <div class="stat-value" style="font-size:18px">${fmtMoney(monthlySpend)}</div></div>
      </div>
    </div>

    ${finished.length ? `
    <div id="finished-reminder" class="finished-banner" onclick="openFinishedDetail()">
      <i class="ti ti-bell-ringing finished-banner-icon"></i>
      <div class="finished-banner-text">
        <div class="finished-banner-title">⚠️ ${finished.length} ta mahsulot tugadi!</div>
        <div class="finished-banner-sub">Roʻyxatni koʻrish uchun bosing</div>
      </div>
      <i class="ti ti-chevron-right finished-banner-arrow"></i>
    </div>` : ''}

    <div id="ov-list"></div>`;

  renderOverviewList();
}

// Tugagan mahsulotlar ro'yxati — papka ichiga kirganday alohida sahifa
function openFinishedDetail() {
  const c = document.getElementById('content');
  const list = finishedProducts();

  const rows = list.length ? list.map(p => {
    const d = daysLeft(p.current_stock, p.daily_usage);
    return `<tr>
      <td style="font-weight:600">${esc(p.name)}</td>
      <td><span class="badge badge-gray">${esc(p.branch_name || brName(p.branch_id))}</span></td>
      <td><span class="badge badge-gray">${esc(p.category || '—')}</span></td>
      <td style="font-weight:700;color:var(--red)">${p.current_stock} ${esc(p.unit)}</td>
      <td style="color:#64748b">${p.daily_usage} ${esc(p.unit)}/kun</td>
      <td>${statusBadge(d)}</td>
      <td style="display:flex;gap:6px;align-items:center">
        ${isWriter() ? `<button class="btn btn-sm btn-primary" onclick="openAddPurchase(${p.id})"><i class="ti ti-shopping-cart"></i>Sotib olish</button>` : ''}
        ${isWriter() ? `<button class="btn btn-sm btn-danger btn-icon" title="Mahsulotni o'chirish" onclick="delFinishedProduct(${p.id},this)"><i class="ti ti-x"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-mood-happy"></i><p>Tugagan mahsulot yoʻq</p></div></td></tr>`;

  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <button class="btn btn-secondary btn-icon" onclick="navigate('overview')" title="Orqaga"><i class="ti ti-arrow-left"></i></button>
      <div>
        <div class="section-title" style="margin:0"><i class="ti ti-bell-ringing" style="color:var(--red);margin-right:6px"></i>Tugagan mahsulotlar</div>
        <div style="font-size:13px;color:#94a3b8">${list.length} ta mahsulot omborda tugagan</div>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Mahsulot</th><th>Filial</th><th>Kategoriya</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Holat</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  paintIcons(c);
}

async function delFinishedProduct(id, btn) {
  if (!confirm("Bu mahsulotni ro'yxatdan o'chirishni tasdiqlaysizmi?")) return;
  try {
    btn.disabled = true;
    await api('DELETE', `/api/products/${id}`);
    toast("O'chirildi");
    await loadAll();
    openFinishedDetail(); // ro'yxatni yangilash
  } catch (e) {
    btn.disabled = false;
    toast(e.message, 'error');
  }
}

// Karta tanlanganda — pastdagi ro'yxatni almashtirish
function setOverviewFilter(f) {
  overviewFilter = f;
  // Karta active holatini yangilash
  document.querySelectorAll('.stats-grid .stat-card').forEach(el => el.classList.remove('active'));
  const map = { all: 0, urgent: 1, low7: 2, spend: 3 };
  const cards = document.querySelectorAll('.stats-grid .stat-card');
  if (cards[map[f]]) cards[map[f]].classList.add('active');
  renderOverviewList();
}

// Mahsulot jadvali qatorlari
function productRows(list) {
  if (!list.length) return `<tr><td colspan="7">
    <div class="empty-state"><i class="ti ti-mood-happy"></i><p>Mahsulot yo'q</p></div></td></tr>`;
  return list.map(p => {
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
        ${isWriter() ? `<button class="btn btn-sm btn-primary" onclick="openAddPurchase(${p.id})">
          <i class="ti ti-shopping-cart"></i>Sotib olish
        </button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function renderOverviewList() {
  const box = document.getElementById('ov-list');
  if (!box) return;

  // Oylik xarajat — sotib olishlar ro'yxati
  if (overviewFilter === 'spend') {
    const now = new Date();
    const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthP = purchases.filter(p => (p.purchase_date || '').startsWith(ym));
    box.innerHTML = `
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <div style="font-size:15px;font-weight:700">
          <i class="ti ti-coin" style="color:#94a3b8;margin-right:6px"></i>Shu oydagi sotib olishlar
        </div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Sana</th><th>Mahsulot</th><th>Filial</th><th>Miqdor</th><th>Narx</th><th>Jami</th></tr></thead>
        <tbody>
          ${monthP.length ? monthP.map(p => `<tr>
            <td style="color:#64748b">${esc(p.purchase_date)}</td>
            <td style="font-weight:600">${esc(p.product_name || '—')}</td>
            <td><span class="badge badge-gray">${esc(p.branch_name || '—')}</span></td>
            <td>${p.quantity} ${esc(p.unit || '')}</td>
            <td>${fmtMoney(p.unit_price)}</td>
            <td style="font-weight:700;color:var(--teal)">${fmtMoney((p.quantity||0)*(p.unit_price||0))}</td>
          </tr>`).join('') : `<tr><td colspan="6">
            <div class="empty-state"><i class="ti ti-shopping-cart-off"></i><p>Bu oyda sotib olish yo'q</p></div></td></tr>`}
        </tbody>
      </table></div></div>`;
    paintIcons(box);
    return;
  }

  // Mahsulot ro'yxatlari
  let list, title, icon;
  if (overviewFilter === 'all') {
    list = products; title = 'Barcha mahsulotlar'; icon = 'box';
  } else if (overviewFilter === 'urgent') {
    list = urgentProducts();
    title = 'Shoshilinch mahsulotlar (≤2 kun)'; icon = 'alarm';
  } else { // low7
    list = lowStockProducts();
    title = 'Kam qolgan mahsulotlar (≤7 kun)'; icon = 'clock';
  }

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:15px;font-weight:700">
        <i class="ti ti-${icon}" style="color:#94a3b8;margin-right:6px"></i>${title}
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>Mahsulot</th><th>Filial</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th><th></th>
      </tr></thead>
      <tbody>${productRows(list)}</tbody>
    </table></div></div>`;
  paintIcons(box);
}
