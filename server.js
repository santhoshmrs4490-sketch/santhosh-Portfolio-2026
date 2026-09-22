import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to load messages
function getStoredMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading messages file:', err);
  }
  return [];
}

// Helper to save messages
function saveMessages(messages) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing messages file:', err);
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Contact Form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message, targetEmail } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    const recipient = targetEmail || 'santhoshmrs4490@gmail.com';
    const timestamp = new Date().toISOString();
    const newEntry = {
      id: Date.now().toString(),
      name: String(name).trim(),
      email: String(email).trim(),
      message: String(message).trim(),
      recipient,
      timestamp,
      status: 'received'
    };

    // 1. Save message locally so it is never lost
    const messages = getStoredMessages();
    messages.unshift(newEntry);
    saveMessages(messages);

    // 2. Dispatch to FormSubmit for direct Gmail inbox routing
    let forwardStatus = 'pending';
    let forwardDetails = null;

    try {
      const formSubmitResp = await fetch(`https://formsubmit.co/ajax/${recipient}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: newEntry.name,
          email: newEntry.email,
          message: newEntry.message,
          _subject: `New Portfolio Message from ${newEntry.name} (${newEntry.email})`,
          _template: 'table',
          sent_at: timestamp
        })
      });

      const fsData = await formSubmitResp.json();
      forwardStatus = formSubmitResp.ok ? 'forwarded' : 'activation_required';
      forwardDetails = fsData;
    } catch (fwErr) {
      console.warn('FormSubmit forwarding note:', fwErr.message);
      forwardStatus = 'local_saved';
      forwardDetails = { note: fwErr.message };
    }

    return res.json({
      success: true,
      message: `Message recorded and dispatched to ${recipient}`,
      entry: newEntry,
      forwardStatus,
      forwardDetails
    });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(500).json({ error: 'Failed to process contact submission.' });
  }
});

// View all stored portfolio messages
app.get('/api/messages', (req, res) => {
  const messages = getStoredMessages();
  res.json({
    count: messages.length,
    messages
  });
});

// Serve static files from root directory with no-cache headers to prevent stale image caching
app.use(express.static(__dirname, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Single-page / static fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
