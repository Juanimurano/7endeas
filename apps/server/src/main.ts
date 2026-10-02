import { createServer } from './server';
const { app } = await createServer({ logger: true });
const port = Number(process.env.PORT ?? 8086);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
app.log.info(`7 endeas · servidor en http://localhost:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
