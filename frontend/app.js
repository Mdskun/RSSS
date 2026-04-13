'use strict';

const API = '';
const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
const feedColor = id => COLORS[Number(id) % COLORS.length];

let token          = localStorage.getItem('fr_token');
let currentUser    = null;
let currentFeedId  = 'all';
let currentFeedName = 'All Articles';
let feeds          = [];
let authMode       = 'login';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) { token = null; localStorage.removeItem('fr_token'); }
      else currentUser = { id: payload.id, email: payload.email };
    } catch { token = null; localStorage.removeItem('fr_token'); }
  }

  if (token) showApp();
  else       showAuth();
});

window.addEventListener('hashchange', handleRoute);

// ─── Auth ──────────────────────────────────────────────────────────────────────

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('user-email').textContent = currentUser?.email || '';
  loadFeeds();
  handleRoute();
}

function switchTab(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && mode === 'login') || (i === 1 && mode === 'register'));
  });
  const isLogin = mode === 'login';
  document.getElementById('auth-submit').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('auth-switch').innerHTML = isLogin
    ? `Don't have an account? <a href="#" onclick="switchTab('register')">Create one</a>`
    : `Already have an account? <a href="#" onclick="switchTab('login')">Sign in</a>`;
  document.getElementById('auth-error').textContent = '';
}

async function submitAuth() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit');

  if (!email || !password) { errEl.textContent = 'Email and password are required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Please wait…';
  errEl.textContent = '';

  try {
    const res  = await fetch(`${API}/api/auth/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) { errEl.textContent = data.error || 'Something went wrong.'; return; }

    token       = data.token;
    currentUser = data.user;
    localStorage.setItem('fr_token', token);
    showApp();
  } catch {
    errEl.textContent = 'Cannot connect to server.';
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('fr_token');
  location.hash = '';
  showAuth();
}

// Auth header helper
function H(extra = {}) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra };
}

// ─── Hash Router ───────────────────────────────────────────────────────────────

function handleRoute() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/article/')) {
    const id = hash.split('/')[2];
    openArticle(id);
  } else {
    closeArticle(false);
  }
}

// ─── Feeds ─────────────────────────────────────────────────────────────────────

async function loadFeeds() {
  try {
    const res = await fetch(`${API}/api/feeds`, { headers: H() });
    if (res.status === 401) { logout(); return; }
    feeds = await res.json();
    renderSidebar();
    loadArticles();
  } catch { showToast('Cannot reach server'); }
}

function renderSidebar() {
  document.getElementById('feed-list').innerHTML = feeds.map(f => `
    <div class="feed-item ${currentFeedId == f.id ? 'active' : ''}"
         data-id="${f.id}"
         onclick="selectFeed(${f.id},'${esc(f.name)}')">
      <span class="feed-dot" style="background:${feedColor(f.id)}"></span>
      <span class="feed-item-name" title="${esc(f.name)}">${esc(f.name)}</span>
    </div>`).join('');

  document.querySelector('[data-id="all"]')
    .classList.toggle('active', currentFeedId === 'all');
}

function selectFeed(id, name) {
  currentFeedId   = id;
  currentFeedName = name;
  document.querySelectorAll('.feed-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id == String(id))
  );
  document.getElementById('feed-title').textContent    = name;
  const sub = id === 'all'
    ? 'Latest from all your feeds'
    : (feeds.find(f => f.id == id)?.url || '');
  document.getElementById('feed-subtitle').textContent = sub;
  document.getElementById('btn-delete').style.display  = id === 'all' ? 'none' : '';
  loadArticles();
}

// ─── Articles ──────────────────────────────────────────────────────────────────

async function loadArticles() {
  const box = document.getElementById('articles');
  box.innerHTML = `<div class="state-loading"><div class="spinner"></div><p>Loading…</p></div>`;
  try {
    const url = currentFeedId === 'all'
      ? `${API}/api/articles?limit=80`
      : `${API}/api/articles?feed_id=${currentFeedId}&limit=80`;
    const res  = await fetch(url, { headers: H() });
    if (res.status === 401) { logout(); return; }
    renderArticles(await res.json());
  } catch {
    box.innerHTML = `<div class="state-error">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>Failed to load articles.</p></div>`;
  }
}

function renderArticles(articles) {
  const box = document.getElementById('articles');
  if (!articles.length) {
    box.innerHTML = `<div class="state-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
      <p>No articles yet. Add a feed or hit refresh.</p></div>`;
    return;
  }

  box.innerHTML = articles.map(a => {
    const color = feedColor(a.feed_id);
    const thumb = a.thumbnail
      ? `<div class="article-thumb-wrap"><img class="article-thumbnail" src="${esc(a.thumbnail)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
      : '';
    return `
      <div class="article-card" onclick="location.hash='#/article/${a.id}'">
        <div class="article-card-body">
          <div class="article-meta">
            <span class="article-source" style="color:${color};background:${color}18">${esc(a.feed_name)}</span>
            ${a.pub_date ? `<span class="article-date">${fmtDate(a.pub_date)}</span>` : ''}
          </div>
          <div class="article-title">${esc(a.title || 'Untitled')}</div>
          ${a.summary ? `<div class="article-summary">${esc(a.summary)}</div>` : ''}
        </div>
        ${thumb}
      </div>`;
  }).join('');
}

// ─── Article Detail ────────────────────────────────────────────────────────────

async function openArticle(id) {
  const view = document.getElementById('article-view');
  view.classList.add('open');

  // Reset
  document.getElementById('article-hero').style.display = 'none';
  document.getElementById('article-detail-title').textContent = 'Loading…';
  document.getElementById('article-body').innerHTML = `<div class="state-loading"><div class="spinner"></div></div>`;
  document.getElementById('article-source').textContent  = '';
  document.getElementById('article-author').textContent  = '';
  document.getElementById('article-date').textContent    = '';
  document.getElementById('article-link').href           = '#';

  try {
    const res     = await fetch(`${API}/api/articles/${id}`, { headers: H() });
    if (res.status === 401) { logout(); return; }
    const article = await res.json();

    const color = feedColor(article.feed_id);

    // Hero image
    if (article.thumbnail) {
      const hero = document.getElementById('article-hero');
      const img  = document.getElementById('article-hero-img');
      img.src    = article.thumbnail;
      img.onerror = () => { hero.style.display = 'none'; };
      hero.style.display = '';
    }

    document.getElementById('article-detail-title').textContent = article.title || 'Untitled';
    document.getElementById('article-link').href                = article.link || '#';

    const srcEl = document.getElementById('article-source');
    srcEl.textContent  = article.feed_name;
    srcEl.style.color  = color;
    srcEl.style.background = color + '18';

    if (article.author) {
      document.getElementById('article-author').textContent = article.author;
    }
    if (article.pub_date) {
      document.getElementById('article-date').textContent = fmtDate(article.pub_date);
    }

    // Content
    const body = article.content || article.summary || '<p>No content available. Click "Read original" to view the full article.</p>';
    document.getElementById('article-body').innerHTML = sanitize(body);

  } catch {
    document.getElementById('article-body').innerHTML = '<p>Failed to load article.</p>';
  }
}

function closeArticle(navigate = true) {
  document.getElementById('article-view').classList.remove('open');
  if (navigate && location.hash.startsWith('#/article/')) {
    history.pushState(null, '', ' ');
  }
}

// ─── Refresh / Delete ──────────────────────────────────────────────────────────

async function refreshCurrent() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  try {
    if (currentFeedId === 'all') {
      await Promise.all(feeds.map(f =>
        fetch(`${API}/api/feeds/${f.id}/refresh`, { method: 'POST', headers: H() })
      ));
      showToast('All feeds refreshed');
    } else {
      await fetch(`${API}/api/feeds/${currentFeedId}/refresh`, { method: 'POST', headers: H() });
      showToast('Feed refreshed');
    }
    await loadArticles();
  } catch { showToast('Refresh failed'); }
  finally { btn.classList.remove('spinning'); }
}

async function deleteCurrent() {
  if (!confirm(`Remove "${currentFeedName}" and all its articles?`)) return;
  try {
    await fetch(`${API}/api/feeds/${currentFeedId}`, { method: 'DELETE', headers: H() });
    currentFeedId   = 'all';
    currentFeedName = 'All Articles';
    await loadFeeds();
    showToast('Feed removed');
  } catch { showToast('Could not delete feed'); }
}

// ─── Add Feed Modal ────────────────────────────────────────────────────────────

function openAddModal() {
  document.getElementById('modal').classList.add('open');
  document.getElementById('input-url').focus();
  document.getElementById('modal-error').textContent = '';
  document.getElementById('input-url').value  = '';
  document.getElementById('input-name').value = '';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal')) return;
  document.getElementById('modal').classList.remove('open');
}

async function addFeed() {
  const url   = document.getElementById('input-url').value.trim();
  const name  = document.getElementById('input-name').value.trim();
  const errEl = document.getElementById('modal-error');
  const btn   = document.getElementById('btn-submit');

  if (!url) { errEl.textContent = 'Feed URL is required.'; return; }

  btn.disabled = true; btn.textContent = 'Adding…';
  errEl.textContent = '';

  try {
    const res  = await fetch(`${API}/api/feeds`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ url, name }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Could not add feed.'; return; }

    document.getElementById('modal').classList.remove('open');
    showToast(`Added: ${data.name}`);
    await loadFeeds();
    selectFeed(data.id, data.name);
  } catch { errEl.textContent = 'Network error.'; }
  finally { btn.disabled = false; btn.textContent = 'Add Feed'; }
}

// ─── OPML Export ──────────────────────────────────────────────────────────────

async function exportOPML() {
  try {
    const res = await fetch(`${API}/api/feeds/export`, { headers: H() });
    if (!res.ok) { showToast('Export failed'); return; }
    const xml  = await res.text();
    const blob = new Blob([xml], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'feedreader.opml';
    a.click();
    URL.revokeObjectURL(url);
    showToast('OPML exported');
  } catch { showToast('Export failed'); }
}

// ─── OPML Import ──────────────────────────────────────────────────────────────

function triggerImport() {
  document.getElementById('opml-file').value = '';
  document.getElementById('opml-file').click();
}

async function importOPML(input) {
  const file = input.files[0];
  if (!file) return;

  const modal     = document.getElementById('import-modal');
  const statusEl  = document.getElementById('import-status');
  modal.classList.add('open');
  statusEl.textContent = 'Reading OPML file…';

  try {
    const text = await file.text();
    statusEl.textContent = 'Fetching feeds (this may take a minute)…';

    const res  = await fetch(`${API}/api/feeds/import`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ opml: text }),
    });
    const data = await res.json();

    modal.classList.remove('open');

    if (!res.ok) { showToast('Import failed: ' + data.error, 4000); return; }

    const msg = `Imported ${data.imported} feed${data.imported !== 1 ? 's' : ''}` +
      (data.failed ? ` · ${data.failed} failed` : '');
    showToast(msg, 3500);
    await loadFeeds();
  } catch {
    modal.classList.remove('open');
    showToast('Import failed — check the file format');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script,style,iframe,form,object,embed').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    ['onclick','onload','onerror','onmouseover','onfocus','onblur'].forEach(a => el.removeAttribute(a));
    if (el.hasAttribute('href') && el.getAttribute('href').trim().toLowerCase().startsWith('javascript:')) {
      el.removeAttribute('href');
    }
  });
  return div.innerHTML;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('modal').classList.remove('open');
    if (location.hash.startsWith('#/article/')) closeArticle();
  }
});