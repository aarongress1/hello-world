'use strict';

const path = require('path');
const { createApp } = require('./web');
const config = require('./config');
require('./db'); // initialise schema on boot

const app = createApp({ publicDir: path.join(__dirname, '..', 'public') });

// Health check.
app.get('/api/health', async (req, res) => res.json({ ok: true, demoMode: config.demoMode }));

require('./routes/auth')(app);
require('./routes/parent')(app);
require('./routes/chat')(app);

app.listen(config.port, () => {
  console.log(`\n  🦉 Curio is running at http://localhost:${config.port}`);
  console.log(`     demo mode: ${config.demoMode ? 'ON (canned guide replies, no key needed)' : 'off'}\n`);
});
