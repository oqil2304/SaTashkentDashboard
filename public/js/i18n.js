// ─── i18n.js — UZ / RU / EN tarjima tizimi ───────────────────────────────────
console.log('[i18n.js] yuklandi');

let LANG = localStorage.getItem('lang') || 'uz';
const LANGS = ['uz', 'ru', 'en'];

// Apostrof variantlarini bitta ASCII ' ga keltirish (UZ matnlarida ʻ ʼ ' ` aralash)
function _norm(s) { return String(s).replace(/[ʻʼ‘’`´]/g, "'"); }

// Birlik/qo'shimchalar (manbada ishlatiladi — helpers.js)
const I18N_UNITS = {
  som: { uz: "so'm", ru: 'сум',  en: 'sum' },
  day: { uz: 'kun',  ru: 'дн.',  en: 'days' },
  out: { uz: 'Tugagan', ru: 'Закончился', en: 'Out of stock' },
};
function i18nUnit(key) { return (I18N_UNITS[key] && I18N_UNITS[key][LANG]) || (I18N_UNITS[key] && I18N_UNITS[key].uz) || key; }

// To'liq matn (text node / placeholder / title) — aniq moslik. Kalit: ASCII ' bilan.
// Qiymat: [ru, en]
const I18N_MAP = {
  // Sidebar / topbar
  "Ta'minot Bo'limi": ['Отдел снабжения', 'Supply Department'],
  "Umumiy ko'rinish": ['Обзор', 'Overview'],
  "Umumiy koʻrinish": ['Обзор', 'Overview'],
  "Ombor": ['Склад', 'Warehouse'],
  "Sotib olishlar": ['Закупки', 'Purchases'],
  "Rasxodlar": ['Списания', 'Stock issues'],
  "Filiallar": ['Филиалы', 'Branches'],
  "Hisobot": ['Отчёт', 'Report'],
  "Foydalanuvchilar": ['Пользователи', 'Users'],
  "Shaxsiy kabinet": ['Личный кабинет', 'My profile'],
  "Chiqish": ['Выход', 'Logout'],
  "Ogohlantirishlar": ['Уведомления', 'Notifications'],
  "Yuklanmoqda...": ['Загрузка...', 'Loading...'],
  // Rollar
  "Administrator": ['Администратор', 'Administrator'],
  "Filial omborchisi": ['Кладовщик филиала', 'Branch keeper'],
  "Kuzatuvchi": ['Наблюдатель', 'Viewer'],
  "Foydalanuvchi": ['Пользователь', 'User'],
  // Umumiy ko'rinish
  "Jami mahsulot": ['Всего товаров', 'Total products'],
  "Shoshilinch (≤2 kun)": ['Срочно (≤2 дня)', 'Urgent (≤2 days)'],
  "Kam qoldi (≤7 kun)": ['Заканчивается (≤7 дней)', 'Low stock (≤7 days)'],
  "Oylik xarajat": ['Расходы за месяц', 'Monthly spend'],
  "Ro'yxatni ko'rish uchun bosing": ['Нажмите, чтобы посмотреть список', 'Click to view the list'],
  "Tugagan mahsulotlar": ['Закончившиеся товары', 'Out-of-stock products'],
  "Tugagan mahsulot yo'q": ['Нет закончившихся товаров', 'No out-of-stock products'],
  "Barcha mahsulotlar": ['Все товары', 'All products'],
  "Shoshilinch mahsulotlar (≤2 kun)": ['Срочные товары (≤2 дня)', 'Urgent products (≤2 days)'],
  "Kam qolgan mahsulotlar (≤7 kun)": ['Заканчивающиеся товары (≤7 дней)', 'Low-stock products (≤7 days)'],
  "Mahsulot yo'q": ['Нет товаров', 'No products'],
  "Shu oydagi sotib olishlar": ['Закупки за этот месяц', 'Purchases this month'],
  "Bu oyda sotib olish yo'q": ['В этом месяце закупок нет', 'No purchases this month'],
  // Umumiy jadval sarlavhalari
  "Mahsulot": ['Товар', 'Product'],
  "Filial": ['Филиал', 'Branch'],
  "Kategoriya": ['Категория', 'Category'],
  "Omborda": ['На складе', 'In stock'],
  "Kunlik sarflanish": ['Дневной расход', 'Daily usage'],
  "Qolgan kun": ['Осталось дней', 'Days left'],
  "Holat": ['Статус', 'Status'],
  "Sana": ['Дата', 'Date'],
  "Miqdor": ['Кол-во', 'Quantity'],
  "Narx": ['Цена', 'Price'],
  "Jami": ['Сумма', 'Total'],
  "Birlik narx": ['Цена за ед.', 'Unit price'],
  "Yetkazuvchi": ['Поставщик', 'Supplier'],
  "Birlik": ['Ед. изм.', 'Unit'],
  // Tugmalar / umumiy
  "Sotib olish": ['Купить', 'Buy'],
  "Saqlash": ['Сохранить', 'Save'],
  "Bekor": ['Отмена', 'Cancel'],
  "Tanlang": ['Выберите', 'Select'],
  "Qidirish...": ['Поиск...', 'Search...'],
  "Barcha filiallar": ['Все филиалы', 'All branches'],
  "Barcha kategoriyalar": ['Все категории', 'All categories'],
  "Orqaga": ['Назад', 'Back'],
  "Izoh": ['Примечание', 'Note'],
  "Qo'shimcha ma'lumot": ['Доп. информация', 'Additional info'],
  // Sotib olishlar
  "Sotib olishlar tarixi": ['История закупок', 'Purchase history'],
  "Sotib olish topilmadi": ['Закупки не найдены', 'No purchases found'],
  "Sotib olish qo'shish": ['Добавить закупку', 'Add purchase'],
  "Sotib olishni tahrirlash": ['Редактировать закупку', 'Edit purchase'],
  "Filial *": ['Филиал *', 'Branch *'],
  "Mahsulot *": ['Товар *', 'Product *'],
  "Miqdor *": ['Кол-во *', 'Quantity *'],
  "Birlik narxi (so'm)": ['Цена за ед. (сум)', 'Unit price (sum)'],
  "Yetkazib beruvchi": ['Поставщик', 'Supplier'],
  "Mahsulot nomi (yozing yoki tanlang)": ['Название товара (введите или выберите)', 'Product name (type or select)'],
  "Kompaniya nomi": ['Название компании', 'Company name'],
  "Sotib olish qo'shilganda omborga avtomatik qo'shiladi.": ['При добавлении закупки товар автоматически поступает на склад.', 'When a purchase is added, it is automatically added to the warehouse.'],
  "Omborda yo'q — yangi mahsulot yaratiladi": ['Нет на складе — будет создан новый товар', 'Not in stock — a new product will be created'],
  // Ombor (products)
  "Ombor — barcha mahsulotlar": ['Склад — все товары', 'Warehouse — all products'],
  "Mahsulot qo'shish": ['Добавить товар', 'Add product'],
  "Mahsulot topilmadi": ['Товар не найден', 'No products found'],
  "Mahsulotni tahrirlash": ['Редактировать товар', 'Edit product'],
  "Nomi *": ['Название *', 'Name *'],
  "Ombordagi miqdor": ['Кол-во на складе', 'Stock quantity'],
  "Kunlik sarflanish (ixtiyoriy)": ['Дневной расход (необязательно)', 'Daily usage (optional)'],
  "0 — faqat kerakda ishlatiladi": ['0 — используется только при необходимости', '0 — used only when needed'],
  "Sotib olish (kirim)": ['Купить (приход)', 'Buy (in)'],
  "Rasxod (chiqim)": ['Расход (выдача)', 'Issue (out)'],
  "Tahrirlash": ['Редактировать', 'Edit'],
  "O'chirish": ['Удалить', 'Delete'],
  // Kategoriyalar (ro'yxat)
  "Oziq-ovqat": ['Продукты', 'Food'],
  "Yoqilg'i": ['Топливо', 'Fuel'],
  "Uy-ro'zg'or": ['Хозтовары', 'Household'],
  "Elektr": ['Электрика', 'Electrical'],
  "Ofis": ['Офис', 'Office'],
  "Boshqa": ['Прочее', 'Other'],
  // Rasxodlar (consumptions)
  "Rasxodlar tarixi": ['История списаний', 'Issue history'],
  "Rasxod qilish": ['Списать', 'Issue'],
  "Barcha filiallar (kim uchun)": ['Все филиалы (для кого)', 'All branches (for whom)'],
  "Ombor (qayerdan)": ['Склад (откуда)', 'Warehouse (from)'],
  "Filial uchun": ['Для филиала', 'For branch'],
  "Rasxod topilmadi": ['Списания не найдены', 'No issues found'],
  "Bekor qilish": ['Отменить', 'Cancel'],
  "Rasxod qilish (ombordan chiqim)": ['Списание (выдача со склада)', 'Issue (stock out)'],
  "Ombor (qayerdan) *": ['Склад (откуда) *', 'Warehouse (from) *'],
  "Qaysi filial uchun *": ['Для какого филиала *', 'For which branch *'],
  "Rasxod qilinganda tovar tanlangan ombordan kamayadi.": ['При списании товар уменьшается с выбранного склада.', 'When issued, the item is deducted from the selected warehouse.'],
  "Bu omborda mahsulot yo'q": ['На этом складе нет товаров', 'No products in this warehouse'],
  "Rasxod qilinganda shu ombordan kamayadi.": ['При списании уменьшается с этого склада.', 'It will be deducted from this warehouse.'],
  // Filiallar
  "Filial qo'shish": ['Добавить филиал', 'Add branch'],
  "Filialni tahrirlash": ['Редактировать филиал', 'Edit branch'],
  "Mahsulot turi": ['Видов товаров', 'Product types'],
  "Jami xarajat (so'm)": ['Всего расходов (сум)', 'Total spend (sum)'],
  "Filialdagi mahsulotlar": ['Товары филиала', 'Branch products'],
  "Filial xarajatlari (sotib olishlar tarixi)": ['Расходы филиала (история закупок)', 'Branch expenses (purchase history)'],
  "Bu filialda mahsulot yo'q": ['В этом филиале нет товаров', 'No products in this branch'],
  "Bu filialda sotib olish yo'q": ['В этом филиале нет закупок', 'No purchases in this branch'],
  "Mas'ul shaxs": ['Ответственный', 'Manager'],
  "Manzil": ['Адрес', 'Address'],
  "Telefon": ['Телефон', 'Phone'],
  "Toshkent, ko'cha...": ['Ташкент, улица...', 'Tashkent, street...'],
  "Ism Familiya": ['Имя Фамилия', 'First Last'],
  // Hisobot
  "Oylik hisobot": ['Месячный отчёт', 'Monthly report'],
  "Faol filiallar": ['Активные филиалы', 'Active branches'],
  "Jami sotib olishlar": ['Всего закупок', 'Total purchases'],
  "Jami xarajat": ['Всего расходов', 'Total spend'],
  "Ulush": ['Доля', 'Share'],
  "Batafsil sotib olishlar": ['Подробные закупки', 'Detailed purchases'],
  "Bu oyda sotib olish yo'q": ['В этом месяце закупок нет', 'No purchases this month'],
  // Oylar
  "Yanvar": ['Январь', 'January'], "Fevral": ['Февраль', 'February'], "Mart": ['Март', 'March'],
  "Aprel": ['Апрель', 'April'], "May": ['Май', 'May'], "Iyun": ['Июнь', 'June'],
  "Iyul": ['Июль', 'July'], "Avgust": ['Август', 'August'], "Sentabr": ['Сентябрь', 'September'],
  "Oktabr": ['Октябрь', 'October'], "Noyabr": ['Ноябрь', 'November'], "Dekabr": ['Декабрь', 'December'],
  // Foydalanuvchilar
  "Aloqa": ['Контакты', 'Contact'],
  "Rol / Filial": ['Роль / Филиал', 'Role / Branch'],
  "Ro'yxatdan": ['Регистрация', 'Registered'],
  "Amallar": ['Действия', 'Actions'],
  "Faol": ['Активен', 'Active'],
  "Kutilmoqda": ['Ожидает', 'Pending'],
  "Bloklangan": ['Заблокирован', 'Blocked'],
  "Tasdiqlash": ['Подтвердить', 'Approve'],
  "Bloklash": ['Блокировать', 'Block'],
  "Faollashtirish": ['Активировать', 'Activate'],
  "Rol va filial": ['Роль и филиал', 'Role & branch'],
  "Parolni almashtirish": ['Сменить пароль', 'Reset password'],
  "Rol": ['Роль', 'Role'],
  "Filial (filial omborchisi uchun)": ['Филиал (для кладовщика филиала)', 'Branch (for branch keeper)'],
  "— Filial belgilanmagan —": ['— Филиал не указан —', '— No branch —'],
  "Yangi parol *": ['Новый пароль *', 'New password *'],
  "Administrator — barcha ma'lumotlar, to'liq nazorat": ['Администратор — все данные, полный контроль', 'Administrator — all data, full control'],
  "Filial omborchisi — faqat o'z filiali, yozish huquqi": ["Кладовщик филиала — только свой филиал, право записи", 'Branch keeper — own branch only, write access'],
  "Kuzatuvchi — barcha ma'lumotlar, faqat ko'rish": ['Наблюдатель — все данные, только просмотр', 'Viewer — all data, read-only'],
  "Oddiy foydalanuvchi — ko'rish huquqi": ['Обычный пользователь — право просмотра', 'Regular user — read access'],
  // Profil
  "Rasm yuklash": ['Загрузить фото', 'Upload photo'],
  "Ma'lumotlarni tahrirlash": ['Редактировать данные', 'Edit info'],
  "To'liq ism": ['Полное имя', 'Full name'],
  "Parolni o'zgartirish": ['Сменить пароль', 'Change password'],
  "Joriy parol": ['Текущий пароль', 'Current password'],
  "Yangi parol": ['Новый пароль', 'New password'],
  "Yangi parolni takror": ['Повтор нового пароля', 'Repeat new password'],
  "Parolni yangilash": ['Обновить пароль', 'Update password'],
  // ui / xato
  "Xatolik yuz berdi": ['Произошла ошибка', 'An error occurred'],
  "Qayta urinish": ['Повторить', 'Retry'],
  "Bo'lim topilmadi": ['Раздел не найден', 'Section not found'],
  // Toastlar
  "Yangilandi": ['Обновлено', 'Updated'],
  "Qo'shildi": ['Добавлено', 'Added'],
  "O'chirildi": ['Удалено', 'Deleted'],
  "Saqlandi": ['Сохранено', 'Saved'],
  "Nomi kerak": ['Название обязательно', 'Name is required'],
  "Mahsulot nomini kiriting": ['Введите название товара', 'Enter product name'],
  "Miqdorni kiriting": ['Введите количество', 'Enter quantity'],
  "Mahsulotni tanlang": ['Выберите товар', 'Select a product'],
  "Rasxod qilindi": ['Списано', 'Issued'],
  "Bekor qilindi": ['Отменено', 'Cancelled'],
  "Rasm yangilandi": ['Фото обновлено', 'Photo updated'],
  "Ma'lumotlar saqlandi": ['Данные сохранены', 'Info saved'],
  "Parol yangilandi": ['Пароль обновлён', 'Password updated'],
  "Parol almashtirildi": ['Пароль изменён', 'Password changed'],
  "Tasdiqlandi": ['Подтверждено', 'Approved'],
  "Bloklandi": ['Заблокировано', 'Blocked'],
  // Tasdiq (confirm) oynalari
  "Mahsulotni o'chirishni tasdiqlaysizmi?": ['Удалить товар?', 'Delete this product?'],
  "Bu mahsulotni ro'yxatdan o'chirishni tasdiqlaysizmi?": ['Удалить этот товар из списка?', 'Remove this product from the list?'],
  "Sotib olishni o'chirishni tasdiqlaysizmi?": ['Удалить закупку?', 'Delete this purchase?'],
  "Filialni o'chirishni tasdiqlaysizmi?": ['Удалить филиал?', 'Delete this branch?'],
  "Rasxodni bekor qilasizmi? Tovar omborga qaytariladi.": ['Отменить списание? Товар вернётся на склад.', 'Cancel this issue? The item returns to the warehouse.'],
};

// Bo'lakli (interpolatsiyali) matnlar — substring almashtirish. [uz, ru, en]
const I18N_FRAG = [
  ["/kun", "/дн.", "/day"],
  [" ta mahsulot omborda tugagan", " товаров закончилось на складе", " products are out of stock"],
  [" ta mahsulot tugadi!", " товаров закончилось!", " products ran out!"],
  [" ta boshqa → batafsil", " ещё → подробнее", " more → details"],
  [" ta tasdiq kutmoqda", " ожидают подтверждения", " awaiting approval"],
  [" ta yozuv", " записей", " records"],
  [" shoshilinch", " срочных", " urgent"],
  [" — sotib olishlar · Jami: ", " — закупки · Итого: ", " — purchases · Total: "],
  ["Omborda mavjud:", "На складе есть:", "In stock:"],
  ["Ombordan:", "Со склада:", "From stock:"],
  ["Ro'yxatdan: ", "Регистрация: ", "Registered: "],
  ["Jami: ", "Итого: ", "Total: "],
];

function _langIdx() { return LANG === 'ru' ? 0 : LANG === 'en' ? 1 : -1; }

// Bitta matnni tarjima qilish
function i18nText(text) {
  if (LANG === 'uz' || text == null) return text;
  const idx = _langIdx();
  const nt = _norm(text);
  const key = nt.trim();
  const m = I18N_MAP[key];
  if (m) {
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return lead + m[idx] + trail;
  }
  let s = nt, changed = false;
  for (const fr of I18N_FRAG) {
    if (s.includes(fr[0])) { s = s.split(fr[0]).join(fr[idx + 1]); changed = true; }
  }
  return changed ? s : text;
}

// Asl (UZ) matnlarni saqlash — tilni qaytarganda tiklash uchun
const _origText = new WeakMap();

// DOM ni tarjima qilish (text node, placeholder, title)
function applyI18n(root) {
  root = root || document.body;
  // Text node lar
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    let orig = _origText.get(n);
    if (orig === undefined) { orig = n.nodeValue; _origText.set(n, orig); }
    const tr = (LANG === 'uz') ? orig : i18nText(orig);
    if (tr !== n.nodeValue) n.nodeValue = tr;
  });
  // placeholder va title atributlari
  root.querySelectorAll('[placeholder]').forEach(el => {
    if (el.dataset.i18nPh === undefined) el.dataset.i18nPh = el.getAttribute('placeholder') || '';
    el.setAttribute('placeholder', LANG === 'uz' ? el.dataset.i18nPh : i18nText(el.dataset.i18nPh));
  });
  root.querySelectorAll('[title]').forEach(el => {
    if (el.dataset.i18nTitle === undefined) el.dataset.i18nTitle = el.getAttribute('title') || '';
    el.setAttribute('title', LANG === 'uz' ? el.dataset.i18nTitle : i18nText(el.dataset.i18nTitle));
  });
}

// Tilni almashtirish
function setLang(l) {
  if (!LANGS.includes(l)) return;
  LANG = l;
  localStorage.setItem('lang', l);
  document.documentElement.setAttribute('lang', l);
  document.querySelectorAll('#lang-switch button').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === l));
  // Sidebar foydalanuvchi roli UZ matnga qaytib, qayta tarjima qilinishi uchun
  if (typeof applyUserToSidebar === 'function') applyUserToSidebar();
  // Joriy bo'limni qayta render qilish (UZ manbadan) + butun sahifani tarjima
  if (typeof currentSection !== 'undefined' && typeof renderSection === 'function') {
    renderSection(currentSection);
  }
  applyI18n(document.body);
}

// Native confirm — UZ matnni avtomatik tarjima qiladi
const _origConfirm = window.confirm.bind(window);
window.confirm = function (msg) { return _origConfirm(i18nText(msg)); };

// Til tugmalarini ulash
function initLangSwitch() {
  const sw = document.getElementById('lang-switch');
  if (!sw) return;
  sw.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === LANG);
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  document.documentElement.setAttribute('lang', LANG);
}
