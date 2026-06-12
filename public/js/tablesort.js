// ─── tablesort.js — barcha jadvallarni ustun nomi bo'yicha saralash ──────────
console.log('[tablesort.js] yuklandi');

// Matndan son ajratib olish (masalan "4 dona" → 4, "2.0 kun" → 2, "12 000 so'm" → 12000)
function ts_numVal(text) {
  let t = text.replace(/[\s ]+/g, '');     // probellarni (oddiy va NBSP) olib tashlash
  if (t.indexOf(',') > -1 && t.indexOf('.') > -1) t = t.replace(/,/g, ''); // 1,234.5
  else t = t.replace(',', '.');                  // kasr vergulini nuqtaga
  const m = t.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function ts_isDate(s) { return /^\d{4}-\d{2}-\d{2}/.test(s); }

// Ikkita katak matnini taqqoslash (kichikdan kattaga)
function ts_cmp(a, b) {
  if (ts_isDate(a) && ts_isDate(b)) return a.localeCompare(b);
  const av = ts_numVal(a), bv = ts_numVal(b);
  if (av != null && bv != null) return av - bv;
  if (av != null) return -1;   // sonlar matnlardan oldin
  if (bv != null) return 1;
  return a.localeCompare(b, 'uz');
}

function ts_sortByColumn(table, th) {
  const headRow = th.parentElement;
  const ths = [...headRow.children];
  const idx = ths.indexOf(th);
  const tbody = table.tBodies[0];
  if (!tbody) return;

  const rows = [...tbody.rows];
  if (rows.length <= 1) return;                          // saralashga arzimaydi
  if (rows.some(r => r.querySelector('.empty-state'))) return; // bo'sh holat

  // Yo'nalishni aniqlash (shu ustun avval saralangan bo'lsa — teskari)
  const prevCol = table.dataset.sortCol;
  const dir = (prevCol === String(idx) && table.dataset.sortDir === 'asc') ? 'desc' : 'asc';
  table.dataset.sortCol = idx;
  table.dataset.sortDir = dir;

  rows.sort((ra, rb) => {
    const a = (ra.cells[idx]?.textContent || '').trim();
    const b = (rb.cells[idx]?.textContent || '').trim();
    const r = ts_cmp(a, b);
    return dir === 'asc' ? r : -r;
  });
  rows.forEach(r => tbody.appendChild(r));

  // Ko'rsatkich (▲/▼) ni yangilash
  ths.forEach(h => h.querySelector('.sort-ind')?.remove());
  const ind = document.createElement('span');
  ind.className = 'sort-ind';
  ind.textContent = dir === 'asc' ? ' ▲' : ' ▼';
  th.appendChild(ind);
}

// Butun sahifa uchun bitta delegatsiyalangan hodisa — har qanday jadvalga ishlaydi
document.addEventListener('click', e => {
  const th = e.target.closest('th');
  if (!th || !th.closest('thead')) return;
  const table = th.closest('table');
  if (!table) return;
  ts_sortByColumn(table, th);
});
