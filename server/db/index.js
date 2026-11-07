import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { config } from '../config.js';

const require = createRequire(import.meta.url);

let instance = null;

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
    if (!this.dirty || !this.file) return;
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }

  close() {
    this.flush();
    this.db.close();
  }
}

export async function openDatabase({ file = config.dbFile, inMemory = false } = {}) {
  if (instance) return instance;
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), f),
  });

  let sqlDb;
  const target = inMemory ? null : file;
  if (target && fs.existsSync(target)) {
    sqlDb = new SQL.Database(new Uint8Array(fs.readFileSync(target)));
  } else {
    sqlDb = new SQL.Database();
  }

  const db = new Database(sqlDb, target);
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
