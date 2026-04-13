'use strict';

const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const Parser  = require('rss-parser');
const xml2js  = require('xml2js');
const { pool, init } = require('./db');

const app        = express();
const JWT_SECRET = process.env.JWT_SECRET || 'feedreader_secret_change_in_prod';

const parser = new Parser({
  timeout: 12000,
  customFields: {
    item: [
      ['media:thumbnail',  'mediaThumbnail'],
      ['media:content',    'mediaContent'],
      ['content:encoded',  'contentEncoded'],
      ['dc:creator',       'dcCreator'],
    ],
  },
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Auth middleware ──────────────────────────────────────────────────────────

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({ ok: true }));

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email.toLowerCase().trim(), hash]
    );
    const token = jwt.sign({ id: result.insertId, email }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: result.insertId, email } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password_hash);
    if (!ok)   return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Feeds ────────────────────────────────────────────────────────────────────

app.get('/api/feeds', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, url, created_at FROM feeds WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/feeds', auth, async (req, res) => {
  const { url, name } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const parsed   = await parser.parseURL(url);
    const feedName = (name || parsed.title || url).slice(0, 254);

    const [result] = await pool.query(
      'INSERT INTO feeds (user_id, name, url) VALUES (?, ?, ?)',
      [req.user.id, feedName, url]
    );
    const feedId = result.insertId;
    await saveArticles(feedId, parsed.items);

    res.status(201).json({ id: feedId, name: feedName, url });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Feed already added' });
    res.status(400).json({ error: `Could not fetch feed: ${e.message}` });
  }
});

app.delete('/api/feeds/:id', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM feeds WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OPML Export ──────────────────────────────────────────────────────────────

app.get('/api/feeds/export', auth, async (req, res) => {
  try {
    const [feeds] = await pool.query(
      'SELECT name, url FROM feeds WHERE user_id = ? ORDER BY name',
      [req.user.id]
    );
    const escXml = s => String(s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const outlines = feeds
      .map(f => `    <outline type="rss" text="${escXml(f.name)}" xmlUrl="${escXml(f.url)}"/>`)
      .join('\n');

    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>FeedReader Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
    <ownerEmail>${escXml(req.user.email)}</ownerEmail>
  </head>
  <body>
${outlines}
  </body>
</opml>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="feedreader.opml"');
    res.send(opml);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OPML Import ──────────────────────────────────────────────────────────────

app.post('/api/feeds/import', auth, async (req, res) => {
  const { opml } = req.body || {};
  if (!opml) return res.status(400).json({ error: 'opml XML string required' });

  try {
    const parsed = await xml2js.parseStringPromise(opml, { explicitArray: true });
    const bodyOutlines = parsed?.opml?.body?.[0]?.outline || [];

    function collectFeeds(outlines) {
      const list = [];
      for (const o of outlines) {
        const attr = o.$ || {};
        if (attr.xmlUrl) {
          list.push({ url: attr.xmlUrl.trim(), name: (attr.text || attr.title || attr.xmlUrl).trim() });
        }
        if (o.outline) list.push(...collectFeeds(o.outline));
      }
      return list;
    }

    const toImport = collectFeeds(bodyOutlines);
    if (!toImport.length) return res.status(400).json({ error: 'No feeds found in OPML' });

    let imported = 0, failed = 0;
    const errors = [];

    for (const f of toImport) {
      try {
        const feed = await parser.parseURL(f.url);
        const feedName = (f.name || feed.title || f.url).slice(0, 254);
        const [result] = await pool.query(
          'INSERT IGNORE INTO feeds (user_id, name, url) VALUES (?, ?, ?)',
          [req.user.id, feedName, f.url]
        );
        if (result.insertId) {
          await saveArticles(result.insertId, feed.items);
          imported++;
        } else {
          imported++; // already existed — count as ok
        }
      } catch (e) {
        failed++;
        errors.push({ url: f.url, error: e.message });
      }
    }

    res.json({ imported, failed, errors });
  } catch (e) {
    res.status(400).json({ error: 'Invalid OPML: ' + e.message });
  }
});

// ─── Articles ─────────────────────────────────────────────────────────────────

app.get('/api/articles', auth, async (req, res) => {
  const feedId = req.query.feed_id ? parseInt(req.query.feed_id) : null;
  const limit  = Math.min(parseInt(req.query.limit || '60'), 200);

  let sql = `
    SELECT a.id, a.feed_id, a.title, a.link, a.thumbnail,
           a.summary, a.author, a.pub_date, f.name AS feed_name
    FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE f.user_id = ?
  `;
  const params = [req.user.id];

  if (feedId) {
    sql += ' AND a.feed_id = ?';
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

// Single article (with full content) — for detail page
app.get('/api/articles/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, f.name AS feed_name, f.url AS feed_url
      FROM articles a
      JOIN feeds f ON a.feed_id = f.id
      WHERE a.id = ? AND f.user_id = ?
    `, [req.params.id, req.user.id]);

    if (!rows.length) return res.status(404).json({ error: 'Article not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Refresh ──────────────────────────────────────────────────────────────────

app.post('/api/feeds/:id/refresh', auth, async (req, res) => {
  try {
    const [feeds] = await pool.query(
      'SELECT id, url FROM feeds WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!feeds.length) return res.status(404).json({ error: 'Feed not found' });

    const parsed = await parser.parseURL(feeds[0].url);
    const count  = await saveArticles(feeds[0].id, parsed.items);
    res.json({ ok: true, new_articles: count });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractThumbnail(item) {
  // media:thumbnail
  if (item.mediaThumbnail) {
    const mt = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
    const url = mt?.$?.url || mt?.url || (typeof mt === 'string' ? mt : null);
    if (url) return url;
  }
  // media:content
  if (item.mediaContent) {
    const mc  = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
    const url = mc?.$?.url || mc?.url;
    const typ = mc?.$?.type || mc?.type || '';
    if (url && (typ.startsWith('image/') || typ === '')) return url;
  }
  // enclosure
  if (item.enclosure?.url && (item.enclosure.type || '').startsWith('image/')) {
    return item.enclosure.url;
  }
  // first <img> in HTML content
  const html = item.contentEncoded || item.content || '';
  const m = html.match(/<img[^>]+src=["']([^"']{8,})["']/i);
  if (m && !m[1].startsWith('data:')) return m[1];

  return null;
}

async function saveArticles(feedId, items) {
  let count = 0;
  for (const item of (items || []).slice(0, 80)) {
    try {
      const pubDate   = item.pubDate || item.isoDate ? new Date(item.pubDate || item.isoDate) : null;
      const thumbnail = extractThumbnail(item);
      const content   = item.contentEncoded || item.content || null;
      const summary   = (item.contentSnippet || item.summary || '').slice(0, 2000);
      const author    = (item.dcCreator || item.author || item.creator || '').slice(0, 254);

      const [r] = await pool.query(`
        INSERT IGNORE INTO articles
          (feed_id, title, link, thumbnail, summary, content, author, pub_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        feedId,
        (item.title || '').slice(0, 999),
        (item.link  || '').slice(0, 1999),
        thumbnail,
        summary,
        content,
        author,
        pubDate && !isNaN(pubDate) ? pubDate : null,
      ]);
      count += r.affectedRows;
    } catch (_) {}
  }
  return count;
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000');

init().then(() =>
  app.listen(PORT, '0.0.0.0', () => console.log(`[server] :${PORT}`))
).catch(err => { console.error(err); process.exit(1); });