// ─── state.js — barcha global o'zgaruvchilar ─────────────────────────────────
console.log('[state.js] yuklandi');

let currentSection = 'overview';
let branches   = [];
let products   = [];
let purchases  = [];
let consumptions = [];
let categories = [];
let currentUser = null;
let users = [];

function isAdmin()  { return currentUser?.role === 'admin'; }
function isWriter() { return currentUser?.role === 'admin' || currentUser?.role === 'branch'; }
