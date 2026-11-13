import { createServer } from './server.mjs';

const port = Number(process.env.PORT ?? 3000);
// E2E_RESET_TOKEN lets the e2e webServer start this app without copying the token into the Playwright config.
const resetToken = process.env.RESET_TOKEN || process.env.E2E_RESET_TOKEN || undefined;

// PLANTED_BUGS=1 adds the /lab pages with deliberate bugs, used to test the explorer.
const plantedBugs = process.env.PLANTED_BUGS === '1';

createServer({ resetToken, plantedBugs }).listen(port, () => {
  console.log(
    `demo-app listening on http://localhost:${port} (test reset ${resetToken ? 'enabled' : 'disabled'}${plantedBugs ? ', planted bugs ON' : ''})`,
  );
});
