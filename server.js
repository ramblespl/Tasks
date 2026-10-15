import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

const distPath = path.join(__dirname, 'dist');

// Serve static assets from dist
app.use(express.static(distPath));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// SPA catch-all fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
