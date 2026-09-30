import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Rox Restaurant API listening on port ${config.port} (${config.nodeEnv})`);
});

// Hosting platforms send SIGTERM before replacing the process on deploy.
// Stop accepting new connections and let in-flight requests finish.
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server');
  server.close(() => process.exit(0));
});
