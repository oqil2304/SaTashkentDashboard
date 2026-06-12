// ─── main.js — asosiy boshqaruv: init, navigate, loadAll ─────────────────────
console.log('[main.js] yuklandi');

async function loadAll() {
  console.log('[main.js] loadAll boshlandi...');
  const results = await Promise.all([
    api('GET', '/api/branches'),
    api('GET', '/api/products'),
    api('GET', '/api/purchases'),
    api('GET', '/api/categories'),
    api('GET', '/api/consumptions'),
  ]);
  branches     = results[0];
  products     = results[1];
  purchases    = results[2];
  categories   = results[3];
  consumptions = results[4];
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
    products:  'Ombor',
    purchases: 'Sotib olishlar',
    consumptions: 'Rasxodlar',
    branches:  'Filiallar',
    report:    'Hisobot',
    users:     'Foydalanuvchilar',
    profile:   'Shaxsiy kabinet'
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
    case 'consumptions': renderConsumptions(c); break;
    case 'branches':  renderBranches(c);  break;
    case 'report':    renderReport(c);    break;
    case 'users':     renderUsers(c);     break;
    case 'profile':   renderProfile(c);   break;
    default: c.innerHTML = `<div class="empty-state"><i class="ti ti-question-mark"></i><p>Boʻlim topilmadi</p></div>`;
  }
  paintIcons(c);
}

// Sidebar foydalanuvchi maʼlumotini yangilash
function applyUserToSidebar() {
  if (!currentUser) return;
  const av = document.getElementById('user-avatar');
  const un = document.getElementById('sidebar-username');
  const rl = document.querySelector('.sidebar-role');
  if (av) av.textContent = (currentUser.username || 'A')[0].toUpperCase();
  if (un) un.textContent = currentUser.full_name || currentUser.username;
  if (rl) rl.textContent = currentUser.role === 'admin' ? 'Administrator' : 'Foydalanuvchi';
}

async function init() {
  console.log('[main.js] init boshlandi');

  // Foydalanuvchi ma'lumotlarini olish
  try {
    currentUser = await api('GET', '/api/me');
    console.log('[main.js] currentUser:', currentUser);
    applyUserToSidebar();
    // Rol asosida koʻrinish: admin boʻlmasa — yozish tugmalari va admin menyu yashiriladi
    document.body.classList.toggle('role-viewer', !isAdmin());
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin() ? '' : 'none');
  } catch (e) {
    console.error('[main.js] /api/me xatosi:', e);
    if (e.status === 401) {
      window.location.replace('/login');
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
      window.location.replace('/login');
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
    window.location.replace('/login');
  });

  // Sidebar toggle (mobil)
  document.getElementById('sidebar-toggle')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open')
  );

  // Bell tugmasi — qaysi bo'limda bo'lsa ham umumiy ko'rinishga o'tib,
  // "tugadi" katakchasini ichiga kirmasdan migit qiladi (diqqat tortadi)
  document.getElementById('alert-btn')?.addEventListener('click', () => {
    navigate('overview');
    setTimeout(() => {
      const el = document.getElementById('finished-reminder');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth; // animatsiyani qayta ishga tushirish
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2400);
    }, 60);
  });

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
