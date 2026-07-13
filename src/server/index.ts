import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import router from './routes';

const app = express();

// Parse JSON bodies
app.use(express.json());

// CORS for development (Vite proxy handles prod)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Mount API router
app.use('/api', router);

// Serve frontend static files in production
const frontendDist = path.join(__dirname, '..', '..', 'dist', 'frontend');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`cc-timeline server running on http://localhost:${config.port}`);
});

export default app;
