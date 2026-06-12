// ─── state.js — barcha global o'zgaruvchilar ─────────────────────────────────
console.log('[state.js] yuklandi');

let currentSection = 'overview';
let branches   = [];
let products   = [];
let purchases  = [];
let categories = [];
let currentUser = null;
let users = [];

// Joriy foydalanuvchi admin-mi?
function isAdmin() { return currentUser && currentUser.role === 'admin'; }
