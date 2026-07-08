import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'status.config.json');
const distDir = path.join(rootDir, 'dist');
const port = process.env.PORT || 3001;

const app = express();

async function readStatusConfig() {
  const file = await readFile(configPath, 'utf8');
  const config = JSON.parse(file);

  return {
    ...config,
    generatedAt: new Date().toISOString()
  };
}

app.get('/api/status', async (_request, response) => {
  try {
    response.json(await readStatusConfig());
  } catch (error) {
    response.status(500).json({
      error: 'Unable to read status configuration',
      detail: error.message
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Status API running at http://localhost:${port}`);
});
