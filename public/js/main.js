// ─── main.js — asosiy boshqaruv: init, navigate, loadAll ─────────────────────
console.log('[main.js] yuklandi');

async function loadAll() {
  console.log('[main.js] loadAll boshlandi...');
  const results = await Promise.all([
    api('GET', '/api/branches'),
    api('GET', '/api/products'),
    api('GET', '/api/purchases'),
    api('GET', '/api/categories'),
  ]);
  branches   = results[0];
  products   = results[1];
  purchases  = results[2];
  categories = results[3];
  console.log('[main.js] loadAll tugadi — branches:', branches.length, 'products:', products.length, 'purchases:', purchases.length);
  updateAlertBadge();
}

function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item[data-section]').forEach(el =>
    el.classList.toggle('active', el.dataset.section === section)
  );
  const titles = {
    overview:  "Umumiy koʻrinish",
    products:  'Mahsulotlar',
    purchases: 'Sotib olishlar',
    branches:  'Filiallar',
    report:    'Hisobot'
  };
  document.getElementById('page-title').textContent = titles[section] || section;
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  renderSection(section);
}

function renderSection(s) {
  const c = document.getElementById('content');
  console.log('[main.js] renderSection:', s);
  switch (s) {
    case 'overview':  renderOverview(c);  break;
    case 'products':  renderProducts(c);  break;
    case 'purchases': renderPurchases(c); break;
    case 'branches':  renderBranches(c);  break;
    case 'report':    renderReport(c);    break;
    default: c.innerHTML = `<div class="empty-state"><i class="ti ti-question-mark"></i><p>Boʻlim topilmadi</p></div>`;
  }
  paintIcons(c);
}

async function init() {
  console.log('[main.js] init boshlandi');

  // Foydalanuvchi ma'lumotlarini olish
  try {
    currentUser = await api('GET', '/api/me');
    console.log('[main.js] currentUser:', currentUser);
    const av = document.getElementById('user-avatar');
    const un = document.getElementById('sidebar-username');
    if (av) av.textContent = (currentUser.username || 'A')[0].toUpperCase();
    if (un) un.textContent = currentUser.username;
  } catch (e) {
    console.error('[main.js] /api/me xatosi:', e);
    if (e.status === 401) {
      window.location.replace('/');
      return;
    }
    showError('/api/me xatosi: ' + e.message);
    return;
  }

  // Barcha ma'lumotlarni yuklash
  try {
    await loadAll();
  } catch (e) {
    console.error('[main.js] loadAll xatosi:', e);
    if (e.status === 401) {
      window.location.replace('/');
      return;
    }
    showError('Maʼlumot yuklashda xato: ' + e.message);
    return;
  }

  // Navigatsiya tugmalari
  document.querySelectorAll('.nav-item[data-section]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.section); })
  );

  // Chiqish
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await api('POST', '/api/auth/logout'); } catch (_) {}
    window.location.replace('/');
  });

  // Sidebar toggle (mobil)
  document.getElementById('sidebar-toggle')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open')
  );

  // Bell tugmasi
  document.getElementById('alert-btn')?.addEventListener('click', () => navigate('overview'));

  // Boshlangʻich sahifa
  navigate('overview');

  // Har 5 daqiqada yangilash
  setInterval(async () => {
    try { await loadAll(); updateAlertBadge(); } catch (_) {}
  }, 5 * 60 * 1000);

  console.log('[main.js] init muvaffaqiyatli yakunlandi');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[main.js] DOMContentLoaded — init chaqirilmoqda');
  init();
});
