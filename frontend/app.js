const API = '';  // same origin via nginx proxy
let currentFeedId = 'all';
let currentFeedName = 'All Articles';
let feeds = [];

const COLORS = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6'
];

function feedColor(id) {
  return COLORS[id % COLORS.length];
}

// ── Bootstrap ──────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadFeeds();
});

async function loadFeeds() {
  try {
    const res = await fetch(`${API}/api/feeds`);
    feeds = await res.json();
    renderSidebar();
    loadArticles();
  } catch (e) {
    showToast('Could not connect to server');
  }
}

// ── Sidebar ────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('feed-list');
  list.innerHTML = feeds.map((f, i) => `
    <div class="feed-item ${currentFeedId == f.id ? 'active' : ''}"
         data-id="${f.id}"
         onclick="selectFeed(${f.id}, '${escHtml(f.name)}')">
      <span class="feed-dot" style="background:${feedColor(f.id)}"></span>
      <span class="feed-item-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
    </div>
  `).join('');

  document.querySelector('[data-id="all"]').classList.toggle(
    'active', currentFeedId === 'all'
  );
}

function selectFeed(id, name) {
  currentFeedId = id;
  currentFeedName = name;
  document.querySelectorAll('.feed-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id == String(id))
  );
  document.getElementById('feed-title').textContent = name;
  const sub = id === 'all'
    ? 'Latest from all your feeds'
    : feeds.find(f => f.id == id)?.url || '';
  document.getElementById('feed-subtitle').textContent = sub;
  document.getElementById('btn-delete').style.display = id === 'all' ? 'none' : '';
  loadArticles();
}

// ── Articles ───────────────────────────────────
async function loadArticles() {
  const box = document.getElementById('articles');
  box.innerHTML = `<div class="state-loading"><div class="spinner"></div><p>Loading articles…</p></div>`;
  try {
    const url = currentFeedId === 'all'
      ? `${API}/api/articles?limit=80`
      : `${API}/api/articles?feed_id=${currentFeedId}&limit=80`;
    const res = await fetch(url);
    const articles = await res.json();
    renderArticles(articles);
  } catch (e) {
    box.innerHTML = `<div class="state-error">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>Failed to load articles. Is the backend running?</p>
    </div>`;
  }
}

function renderArticles(articles) {
  const box = document.getElementById('articles');
  if (!articles.length) {
    box.innerHTML = `<div class="state-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
      <p>No articles yet.<br>Add a feed or refresh to get started.</p>
    </div>`;
    return;
  }
  box.innerHTML = articles.map(a => {
    const color = feedColor(a.feed_id);
    const date = a.pub_date ? fmtDate(a.pub_date) : '';
    return `
      <a class="article-card" href="${escAttr(a.link)}" target="_blank" rel="noopener">
        <div class="article-meta">
          <span class="article-source" style="color:${color};background:${color}18">${escHtml(a.feed_name)}</span>
          ${date ? `<span class="article-date">${date}</span>` : ''}
        </div>
        <div class="article-title">${escHtml(a.title || 'Untitled')}</div>
        ${a.summary ? `<div class="article-summary">${escHtml(a.summary)}</div>` : ''}
      </a>`;
  }).join('');
}

// ── Refresh ────────────────────────────────────
async function refreshCurrent() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  try {
    if (currentFeedId === 'all') {
      await Promise.all(feeds.map(f =>
        fetch(`${API}/api/feeds/${f.id}/refresh`, { method: 'POST' })
      ));
      showToast('All feeds refreshed');
    } else {
      await fetch(`${API}/api/feeds/${currentFeedId}/refresh`, { method: 'POST' });
      showToast('Feed refreshed');
    }
    await loadArticles();
  } catch (e) {
    showToast('Refresh failed');
  } finally {
    btn.classList.remove('spinning');
  }
}

// ── Delete ─────────────────────────────────────
async function deleteCurrent() {
  if (!confirm(`Remove "${currentFeedName}" and all its articles?`)) return;
  try {
    await fetch(`${API}/api/feeds/${currentFeedId}`, { method: 'DELETE' });
    currentFeedId = 'all';
    currentFeedName = 'All Articles';
    await loadFeeds();
    showToast('Feed removed');
  } catch (e) {
    showToast('Could not delete feed');
  }
}

// ── Add Feed Modal ─────────────────────────────
function openModal() {
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('input-url').focus();
  document.getElementById('modal-error').textContent = '';
  document.getElementById('input-url').value = '';
  document.getElementById('input-name').value = '';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-backdrop')) return;
  document.getElementById('modal-backdrop').classList.remove('open');
}

async function addFeed() {
  const url   = document.getElementById('input-url').value.trim();
  const name  = document.getElementById('input-name').value.trim();
  const errEl = document.getElementById('modal-error');
  const btn   = document.getElementById('btn-submit');

  if (!url) { errEl.textContent = 'Feed URL is required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Adding…';
  errEl.textContent = '';

  try {
    const res = await fetch(`${API}/api/feeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Could not add feed.';
      return;
    }
    document.getElementById('modal-backdrop').classList.remove('open');
    showToast(`Added: ${data.name}`);
    await loadFeeds();
    selectFeed(data.id, data.name);
  } catch (e) {
    errEl.textContent = 'Network error — is the server running?';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Feed';
  }
}

// ── Helpers ────────────────────────────────────
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return escHtml(s); }

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('en-US',{
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return ''; }
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('modal-backdrop').classList.remove('open');
});