'use strict';

const path = require('path');
const { createApp } = require('./web');
const config = require('./config');
const { defaultSecret } = require('./llm');
require('./db'); // initialise schema on boot

const app = createApp({ publicDir: path.join(__dirname, '..', 'public') });

const bundled = defaultSecret();

// Health check (also reports whether a real AI key is loaded).
app.get('/api/health', async (req, res) => res.json({ ok: true, demoMode: config.demoMode, aiConnected: !!bundled }));

require('./routes/auth')(app);
require('./routes/parent')(app);
require('./routes/chat')(app);

app.listen(config.port, () => {
  console.log(`\n  🦉 Curio is running at http://localhost:${config.port}`);
  if (bundled) {
    console.log(`     AI: ✅ REAL model connected (${bundled.provider} / ${bundled.model})\n`);
  } else {
    console.log(`     AI: ⚠️  DEMO mode — no CURIO_AI_KEY detected. Kids get canned replies.`);
    console.log(`         Add CURIO_AI_PROVIDER / CURIO_AI_KEY / CURIO_AI_MODEL to .env for real tutoring.\n`);
  }
});
