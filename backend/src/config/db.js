const { Pool } = require('pg');

// I provider Postgres hosted (Neon, Supabase, Railway, Vercel Postgres...) richiedono SSL:
// va abilitato esplicitamente con DATABASE_SSL=true, perché Postgres locale in dev di solito non lo supporta.
const useSSL = process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = pool;
