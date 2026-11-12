import { createServer } from './server.mjs';

const port = Number(process.env.PORT ?? 3000);
const resetToken = process.env.RESET_TOKEN || undefined;

createServer({ resetToken }).listen(port, () => {
  console.log(`demo-app listening on http://localhost:${port} (test reset ${resetToken ? 'enabled' : 'disabled'})`);
});
