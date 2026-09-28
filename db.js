"use strict";

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Configure PostgreSQL in .env or Render.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      blocked BOOLEAN NOT NULL DEFAULT FALSE,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS folva_state (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      initialized BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id UUID PRIMARY KEY,
      owner_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS media_assets_owner_id_idx ON media_assets(owner_id);

    INSERT INTO folva_state (id, payload)
    VALUES (1, '{"projects":[],"settings":{"title":"أفكارٌ تستحق أن تُرى.","subtitle":"مساحة تجمع المبدعين وأعمالهم الجميلة. اكتشف الإلهام التالي، أو شارك العالم ما تصنعه.","brand":"FOLVA","accent":"#d5f260","surface":"#f2f3ed","foreground":"#1d211b","allowSignup":true,"enableComments":true,"enableMessages":true},"categories":[],"comments":{},"chats":{},"siteMessages":[],"notifications":{},"visitors":[]}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

module.exports = { pool, initializeDatabase };