// ─── report.js — Hisobot bo'limi ──────────────────────────────────────────────
console.log('[report.js] yuklandi');

function renderReport(c) {
  console.log('[report.js] renderReport chaqirildi');
  const now = new Date();
  const selYear  = now.getFullYear();
  const selMonth = now.getMonth() + 1;

  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const monthOpts = UZ_MONTHS.map((name, i) =>
    `<option value="${i+1}" ${i+1 === selMonth ? 'selected' : ''}>${name}</option>`
  ).join('');
  const yearOpts = [selYear - 1, selYear, selYear + 1]
    .map(y => `<option value="${y}" ${y === selYear ? 'selected' : ''}>${y}</option>`).join('');

  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Oylik hisobot</div>
      <div style="display:flex;gap:10px;align-items:center">
        <select class="form-select" id="rep-month" onchange="applyReport()" style="min-width:130px;font-weight:600">${monthOpts}</select>
        <select class="form-select" id="rep-year"  onchange="applyReport()" style="min-width:90px;font-weight:600">${yearOpts}</select>
      </div>
    </div>
    <div id="report-body"></div>`;
  applyReport();
}

function applyReport() {
  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const body  = document.getElementById('report-body');
  if (!body) return;

  const monthPurchases = purchases.filter(p => (p.purchase_date || '').startsWith(ym));
  const totalAll = monthPurchases.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  const branchStats = branches.map(b => {
    const bPurch = monthPurchases.filter(p => p.branch_id == b.id);
    const total  = bPurch.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);
    const topMap = {};
    bPurch.forEach(p => { topMap[p.product_name] = (topMap[p.product_name] || 0) + (p.quantity || 0) * (p.unit_price || 0); });
    const top = Object.entries(topMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return { ...b, purchase_count: bPurch.length, total_amount: total, top_product: top };
  }).sort((a, b) => b.total_amount - a.total_amount);

  // store for detail view
  body.dataset.ym = ym;

  body.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-icon blue"><i class="ti ti-building-store"></i></div>
        <div><div class="stat-label">Faol filiallar</div>
          <div class="stat-value">${branchStats.filter(b => b.total_amount > 0).length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal"><i class="ti ti-shopping-cart"></i></div>
        <div><div class="stat-label">Jami sotib olishlar</div>
          <div class="stat-value">${monthPurchases.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Jami xarajat</div>
          <div class="stat-value" style="font-size:18px">${fmtMoney(totalAll)}</div></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="table-wrap"><table>
        <thead><tr><th>Filial</th><th>Sotib olishlar</th><th>Jami xarajat</th><th>Ulush</th></tr></thead>
        <tbody>
          ${branchStats.map(b => {
            const pct = totalAll > 0 ? (b.total_amount / totalAll * 100).toFixed(1) : 0;
            return `<tr style="cursor:pointer" onclick="openReportBranchDetail(${b.id})">
              <td style="font-weight:600">${esc(b.name)}</td>
              <td>${b.purchase_count}</td>
              <td style="font-weight:700;color:var(--teal)">${fmtMoney(b.total_amount)}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;min-width:60px">
                  <div style="height:100%;background:var(--teal);border-radius:3px;width:${pct}%"></div>
                </div>
                <span style="font-size:12px;color:#64748b;flex-shrink:0">${pct}%</span>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:15px">Batafsil sotib olishlar</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Sana</th><th>Mahsulot</th><th>Filial</th><th>Miqdor</th><th>Narx</th><th>Jami</th><th>Yetkazuvchi</th></tr></thead>
        <tbody>
          ${monthPurchases.length
            ? monthPurchases.map(p => `<tr>
                <td style="color:#64748b">${esc(p.purchase_date)}</td>
                <td style="font-weight:600">${esc(p.product_name || '—')}</td>
                <td><span class="badge badge-gray">${esc(p.branch_name || '—')}</span></td>
                <td>${p.quantity} ${esc(p.unit || '')}</td>
                <td>${fmtMoney(p.unit_price)}</td>
                <td style="font-weight:600;color:var(--teal)">${fmtMoney((p.quantity || 0) * (p.unit_price || 0))}</td>
                <td style="color:#64748b">${esc(p.supplier || '—')}</td>
              </tr>`).join('')
            : `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-calendar-off"></i><p>Bu oyda sotib olish yoʻq</p></div></td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
}

function openReportBranchDetail(branchId) {
  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;

  const branch = branches.find(b => b.id == branchId);
  const bName  = branch ? branch.name : '—';
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const mLabel = `${UZ_MONTHS[month - 1]} ${year}`;

  const list = purchases.filter(p => p.branch_id == branchId && (p.purchase_date || '').startsWith(ym));
  const total = list.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  const rows = list.length
    ? list.map(p => `<tr>
        <td style="color:#64748b">${esc(p.purchase_date)}</td>
        <td style="font-weight:600">${esc(p.product_name || '—')}</td>
        <td>${p.quantity} ${esc(p.unit || '')}</td>
        <td>${fmtMoney(p.unit_price)}</td>
        <td style="font-weight:700;color:var(--teal)">${fmtMoney((p.quantity || 0) * (p.unit_price || 0))}</td>
        <td style="color:#64748b">${esc(p.supplier || '—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-calendar-off"></i><p>Bu oyda sotib olish yo'q</p></div></td></tr>`;

  const c = document.getElementById('content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <button class="btn btn-secondary btn-icon" onclick="navigate('report')" title="Orqaga"><i class="ti ti-arrow-left"></i></button>
      <div>
        <div class="section-title" style="margin:0"><i class="ti ti-building-store" style="color:var(--teal);margin-right:6px"></i>${esc(bName)}</div>
        <div style="font-size:13px;color:#94a3b8">${mLabel} — sotib olishlar · Jami: ${fmtMoney(total)}</div>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Sana</th><th>Mahsulot</th><th>Miqdor</th><th>Narx</th><th>Jami</th><th>Yetkazuvchi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  paintIcons(c);
}
