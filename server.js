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

// Runtime configuration endpoint for Docker / custom hosting with environment variables
app.get('/api/config', (req, res) => {
  res.json({
    oAuthClientId:
      process.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      process.env.VITE_OAUTH_CLIENT_ID ||
      '',
    projectId:
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      '',
    apiKey:
      process.env.VITE_FIREBASE_API_KEY ||
      process.env.FIREBASE_API_KEY ||
      '',
    authDomain:
      process.env.VITE_FIREBASE_AUTH_DOMAIN ||
      process.env.FIREBASE_AUTH_DOMAIN ||
      '',
    firestoreDatabaseId:
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      process.env.FIRESTORE_DATABASE_ID ||
      '',
    storageBucket:
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      '',
    messagingSenderId:
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.FIREBASE_MESSAGING_SENDER_ID ||
      '',
    appId:
      process.env.VITE_FIREBASE_APP_ID ||
      process.env.FIREBASE_APP_ID ||
      '',
    staticGoogleToken:
      process.env.VITE_GOOGLE_STATIC_ACCESS_TOKEN ||
      process.env.GOOGLE_STATIC_ACCESS_TOKEN ||
      process.env.GOOGLE_AUTH_TOKEN ||
      '',
  });
});

// SPA catch-all fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
