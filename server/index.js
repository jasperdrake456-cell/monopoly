'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const { getPassword, setPassword, generatePassword } = require('./passwordStore');
const { sendPasswordEmail } = require('./email');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ── Auth API ─────────────────────────────────────────────────────────────────

// Client calls this to verify the password
app.post('/api/auth', (req, res) => {
  const { password } = req.body || {};
  if (password === getPassword()) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

// Scheduled task calls this to rotate the password + trigger email
app.post('/api/rotate-password', async (req, res) => {
  const secret = process.env.ROTATE_SECRET;
  const auth = req.headers['authorization'] || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const newPassword = generatePassword();
  setPassword(newPassword);
  io.emit('force-logout');
  console.log(`[rotate] New password set: ${newPassword}`);

  // Persist new password to Railway env var so it survives redeploys
  try {
    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const projectId    = process.env.RAILWAY_PROJECT_ID;
    const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
    const serviceId    = process.env.RAILWAY_SERVICE_ID;
    if (railwayToken && projectId && environmentId && serviceId) {
      await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${railwayToken}` },
        body: JSON.stringify({
          query: `mutation VariableUpsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
          variables: { input: { projectId, environmentId, serviceId, name: 'GAME_PASSWORD', value: newPassword } },
        }),
      });
      console.log(`[rotate] GAME_PASSWORD env var updated in Railway`);
    }
  } catch (e) {
    console.error('[rotate] Railway env update failed:', e.message);
  }

  try {
    await sendPasswordEmail(newPassword);
    res.json({ ok: true, password: newPassword });
  } catch (err) {
    console.error('[rotate] Email failed:', err.message);
    res.status(500).json({ ok: false, error: 'Email failed', password: newPassword });
  }
});

// ── Claude AI API ─────────────────────────────────────────────────────────────

app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: 'You are a helpful AI assistant built into a game hub. Be friendly, concise, and helpful.',
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

// ── Static client ─────────────────────────────────────────────────────────────

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Game namespaces ───────────────────────────────────────────────────────────

require('./games/monopoly').register(io.of('/monopoly'));
require('./games/chess').register(io.of('/chess'));
require('./games/connect4').register(io.of('/connect4'));
require('./games/checkers').register(io.of('/checkers'));
require('./games/battleship').register(io.of('/battleship'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game platform server running on port ${PORT}`));
