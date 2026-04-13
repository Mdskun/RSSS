'use strict';

const express   = require('express');
const cors      = require('cors');
const Parser    = require('rss-parser');
const { pool, init } = require('./db');

const app    = express();
const parser = new Parser({ timeout: 10000 });

app.use(cors());
app.use(express.json());

// ── Health ─────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── Feeds ──────────────────────────────────────
app.get('/api/feeds', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, url, created_at FROM feeds ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/feeds', async (req, res) => {
  const { url, name } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const parsed   = await parser.parseURL(url);
    const feedName = (name || parsed.title || url).slice(0, 254);

    const [result] = await pool.query(
      'INSERT INTO feeds (name, url) VALUES (?, ?)',
      [feedName, url]
    );
    const feedId = result.insertId;
    await saveArticles(feedId, parsed.items);

    res.status(201).json({ id: feedId, name: feedName, url });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This feed URL is already added.' });
    }
    res.status(400).json({ error: `Could not fetch feed: ${e.message}` });
  }
});

app.delete('/api/feeds/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM feeds WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Articles ───────────────────────────────────
app.get('/api/articles', async (req, res) => {
  const feedId = req.query.feed_id ? parseInt(req.query.feed_id) : null;
  const limit  = Math.min(parseInt(req.query.limit || '60'), 200);

  let sql    = `SELECT a.id, a.feed_id, a.title, a.link, a.summary, a.pub_date,
                       f.name AS feed_name
                FROM articles a
                JOIN feeds f ON a.feed_id = f.id`;
  const params = [];

  if (feedId) {
    sql += ' WHERE a.feed_id = ?';
    params.push(feedId);
  }
  sql += ' ORDER BY a.pub_date DESC LIMIT ?';
  params.push(limit);

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Refresh ────────────────────────────────────
app.post('/api/feeds/:id/refresh', async (req, res) => {
  try {
    const [feeds] = await pool.query(
      'SELECT id, url FROM feeds WHERE id = ?',
      [req.params.id]
    );
    if (!feeds.length) return res.status(404).json({ error: 'Feed not found' });

    const parsed = await parser.parseURL(feeds[0].url);
    const count  = await saveArticles(feeds[0].id, parsed.items);
    res.json({ ok: true, new_articles: count });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Helper ─────────────────────────────────────
async function saveArticles(feedId, items) {
  let count = 0;
  for (const item of (items || []).slice(0, 60)) {
    try {
      const pubDate = item.pubDate || item.isoDate
        ? new Date(item.pubDate || item.isoDate)
        : null;
      const [r] = await pool.query(
        `INSERT IGNORE INTO articles (feed_id, title, link, summary, pub_date)
         VALUES (?, ?, ?, ?, ?)`,
        [
          feedId,
          (item.title        || '').slice(0, 999),
          (item.link         || '').slice(0, 1999),
          (item.contentSnippet || item.summary || '').slice(0, 2000),
          pubDate && !isNaN(pubDate) ? pubDate : null,
        ]
      );
      count += r.affectedRows;
    } catch (_) { /* skip dupe / bad row */ }
  }
  return count;
}

// ── Start ──────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');

init()
  .then(() => app.listen(PORT, '0.0.0.0', () =>
    console.log(`[server] Listening on :${PORT}`)
  ))
  .catch(err => {
    console.error('[server] Init failed:', err);
    process.exit(1);
  });