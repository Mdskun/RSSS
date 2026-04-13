const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER || 'rssuser',
  password: process.env.DB_PASS || 'rsspassword',
  database: process.env.DB_NAME || 'rssdb',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

async function init() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS feeds (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        url        VARCHAR(2000) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_url (url(512))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        feed_id    INT NOT NULL,
        title      VARCHAR(1000),
        link       VARCHAR(2000),
        summary    TEXT,
        pub_date   DATETIME,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
        UNIQUE KEY uq_article (feed_id, link(512))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[db] Tables ready');
  } finally {
    conn.release();
  }
}

module.exports = { pool, init };