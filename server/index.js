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

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Shopfront running on http://localhost:${config.port} (${config.env})`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => {
      getDb().close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
