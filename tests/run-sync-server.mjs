import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server.mjs';
const directory = mkdtempSync(join(tmpdir(), 'shixu-browser-sync-'));
const server = createAppServer({ databasePath: join(directory, 'test.sqlite'), rateLimit: { maxAttempts: 200 } });
server.listen(4183, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
