import cron from 'node-cron';
import { buildApp } from './app.js';
import { config } from './config.js';
import { iotConfigFromEnv, syncIotOnce } from './lib/iot.js';

const app = await buildApp();

// IoT ingest schedule — only when IOT_DB_URL + IOT_DEVICE_MAP are configured.
// Wired here (not in buildApp) so tests never start a scheduler. Overlap
// guard: a slow external query must not stack a second sync on top.
const iotCfg = iotConfigFromEnv();
if (iotCfg) {
  const expr = config.IOT_POLL_CRON ?? '0 * * * *';
  if (!cron.validate(expr)) {
    app.log.error({ expr }, 'invalid IOT_POLL_CRON — iot ingest NOT scheduled');
  } else {
    let running = false;
    cron.schedule(expr, async () => {
      if (running) return;
      running = true;
      try {
        const stats = await syncIotOnce(app.prisma, iotCfg);
        app.log.info(stats, 'iot sync');
      } catch (err) {
        app.log.warn({ err: String(err) }, 'iot sync failed — will retry on next schedule');
      } finally {
        running = false;
      }
    }, { timezone: iotCfg.timezone });
    app.log.info({ expr, devices: Object.keys(iotCfg.deviceMap).length }, 'iot ingest scheduled');
  }
}

// Graceful shutdown: finish in-flight requests, release the port and the
// Prisma connection pool before exiting.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error(err);
        process.exit(1);
      });
  });
}

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
