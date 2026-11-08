import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { config } from '../config.js';

let instance = null;
let blobStore = null;

/** On Netlify the database lives in Netlify Blobs rather than on disk. */
export function useBlobStore(store) {
  blobStore = store;
}

const BLOB_KEY = 'shopfront.db';

/**
 * Locates sql.js' WebAssembly binary.
 *
 * Bundlers rewrite `require.resolve`, so this only probes real filesystem paths:
 * the local node_modules, and /var/task where Netlify unpacks included_files.
 */
function wasmDir() {
  const candidates = [
    path.join(process.cwd(), 'node_modules/sql.js/dist'),
    path.join(process.cwd(), '..', 'node_modules/sql.js/dist'),
    '/var/task/node_modules/sql.js/dist',
  ];
  return candidates.find((dir) => {
    try { return fs.existsSync(path.join(dir, 'sql-wasm.wasm')); } catch { return false; }
  }) || candidates[0];
}

const normalise = (params = []) =>
  params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    return p;
  });

class Database {
  constructor(sqlDb, file) {
    this.db = sqlDb;
    this.file = file;
    this.dirty = false;
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalise(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] ?? null;
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalise(params));
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = this.db.getRowsModified();
    const idRow = this.get('SELECT last_insert_rowid() AS id');
    this.dirty = true;
    return { changes, lastInsertRowid: idRow ? idRow.id : null };
  }

  exec(sql) {
    this.db.run(sql);
    this.dirty = true;
  }

  transaction(fn) {
    this.db.run('BEGIN');
    try {
      const result = fn();
      this.db.run('COMMIT');
      this.dirty = true;
      this.flush();
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  /** Writes the in-memory database to disk atomically. */
  flush() {
    // With a blob store the bytes are uploaded after the request finishes.
    if (blobStore) return;
    if (!this.dirty || !this.file) return;
    try {
      const dir = path.dirname(this.file);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, Buffer.from(this.db.export()));
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      // Read-only filesystem (serverless): the blob store is the real backing
      // store; keep serving from memory rather than failing the request.
      console.warn('disk flush skipped:', err?.code || err?.message);
    }
  }

  close() {
    this.flush();
    this.db.close();
  }

  /** Uploads the database to the blob store when it has changed. */
  async persist() {
    if (!blobStore) {
      this.flush();
      return false;
    }
    if (!this.dirty) return false;
    const bytes = Buffer.from(this.db.export());
    await blobStore.set(BLOB_KEY, bytes, { metadata: { contentType: 'application/x-sqlite3' } });
    this.dirty = false;
    return true;
  }
}

export async function openDatabase({ file = config.dbFile, inMemory = false } = {}) {
  if (instance) return instance;
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(wasmDir(), f),
  });

  let sqlDb;
  const target = inMemory ? null : file;

  // Prefer the blob copy when one exists (serverless deployments).
  let restored = null;
  if (blobStore && !inMemory) {
    const stored = await blobStore.get(BLOB_KEY, { type: 'arrayBuffer' }).catch(() => null);
    if (stored) restored = new Uint8Array(stored);
  }

  if (restored) {
    sqlDb = new SQL.Database(restored);
  } else if (target && fs.existsSync(target)) {
    sqlDb = new SQL.Database(new Uint8Array(fs.readFileSync(target)));
  } else {
    sqlDb = new SQL.Database();
  }

  const db = new Database(sqlDb, target);
  db.dirty = Boolean(blobStore) && !restored; // a fresh blob copy needs uploading
  db.exec('PRAGMA foreign_keys = ON;');
  const schema = fs.readFileSync(path.join(config.root, 'server', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  migrate(db);
  db.flush();
  instance = db;
  return db;
}

/** Additive column migrations, so an existing database keeps working. */
function migrate(db) {
  const columns = {
    users: {
      is_guest: 'INTEGER NOT NULL DEFAULT 0',
      totp_secret: 'TEXT',
      totp_enabled: 'INTEGER NOT NULL DEFAULT 0',
      is_active: 'INTEGER NOT NULL DEFAULT 1',
    },
    orders: { guest_email: 'TEXT', tax_paise: 'INTEGER NOT NULL DEFAULT 0' },
    cart_items: { colour: "TEXT NOT NULL DEFAULT 'Default'" },
    order_items: { colour: "TEXT NOT NULL DEFAULT 'Default'" },
  };
  for (const [table, cols] of Object.entries(columns)) {
    const existing = db.all(`PRAGMA table_info(${table})`).map((c) => c.name);
    for (const [name, def] of Object.entries(cols)) {
      if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    }
  }
}

export function getDb() {
  if (!instance) throw new Error('Database not initialised. Call openDatabase() first.');
  return instance;
}

export function resetDatabaseForTests() {
  instance = null;
}
