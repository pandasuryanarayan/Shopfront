import { config } from './config.js';
import { createApp } from './app.js';
import { openDatabase, getDb } from './db/index.js';
import { seed } from './db/seed.js';

async function main() {
  await openDatabase();

  const db = getDb();
  const count = db.get('SELECT COUNT(*) AS n FROM products').n;
  if (count === 0) {
    console.log('Empty catalogue detected — seeding demo data.');
    await seed({ silent: true });
  }

  // One process, one database, two surfaces on two ports. Running the admin in
  // a separate process would mean two writers on the same SQLite file, so both
  // listeners live here.
  const servers = [];

  const store = createApp({ surface: 'store' }).listen(config.port, () => {
    console.log(`Storefront  → http://localhost:${config.port}  (${config.env})`);
  });
  servers.push(store);

  if (config.adminPort) {
    const admin = createApp({ surface: 'admin' }).listen(config.adminPort, () => {
      console.log(`Admin panel → http://localhost:${config.adminPort}/mukhiya  (${config.env})`);
    });
    servers.push(admin);
  }

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down.`);
    let open = servers.length;
    servers.forEach((server) =>
      server.close(() => {
        open -= 1;
        if (open === 0) {
          getDb().close();
          process.exit(0);
        }
      })
    );
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
