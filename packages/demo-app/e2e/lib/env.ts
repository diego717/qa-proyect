import { existsSync } from 'node:fs';
import path from 'node:path';

// Loads e2e/.env for local runs. Variables already set in the environment (CI secrets) win.
const file = path.join(__dirname, '..', '.env');
if (existsSync(file)) process.loadEnvFile(file);
