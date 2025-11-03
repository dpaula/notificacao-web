
// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const webpush = require('web-push');
const cors = require('cors');
const crypto = require('crypto');
const OpenAI = require('openai');
const emissaoNfseTreinamentoRouter = require('./routes/emissao-nfse-treinamento');

const app = express();
const port = process.env.PORT || 8080;

// --- Environment Variable Validation ---
const requiredEnvVars = [
  'VITE_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'API_TOKEN',
  'OPENAI_API_KEY',
  'CHATKIT_WORKFLOW_ID'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// --- OpenAI Client Configuration ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const chatkitWorkflowId = process.env.CHATKIT_WORKFLOW_ID;

// --- VAPID Configuration ---
const vapidKeys = {
  publicKey: process.env.VITE_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// --- Middleware ---
app.use(express.json());

// --- NEW, ROBUST CORS CONFIGURATION ---
const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

// Create a set of allowed hostnames for efficient lookup
const allowedHostnames = new Set();
allowedOriginsRaw.forEach(origin => {
  try {
    const hostname = new URL(origin).hostname;
    allowedHostnames.add(hostname);
    // Also add the www/non-www variant to the set
    if (hostname.startsWith('www.')) {
      allowedHostnames.add(hostname.substring(4));
    } else {
      allowedHostnames.add(`www.${hostname}`);
    }
  } catch (e) {
    console.warn(`[CORS] Invalid origin specified in ALLOWED_ORIGINS: "${origin}"`);
  }
});

// Forcefully add the primary production domain to the CORS whitelist.
// This provides a fallback if the environment variable is misconfigured.
const productionHostname = 'notify.autevia.com.br';
allowedHostnames.add(productionHostname);
allowedHostnames.add(`www.${productionHostname}`);

if (process.env.NODE_ENV === 'production' && allowedHostnames.size === 0) {
    console.error('[CORS] FATAL ERROR: ALLOWED_ORIGINS is not configured for the production environment. The application will not start.');
    process.exit(1);
} else if (allowedHostnames.size > 0) {
    console.log(`[CORS] Allowed hostnames: ${[...allowedHostnames].join(', ')}`);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl, mobile apps, etc.)
    if (!origin) {
      return callback(null, true);
    }

    let originHostname;
    try {
      originHostname = new URL(origin).hostname;
    } catch (e) {
      console.error(`[CORS] Rejected invalid origin format: "${origin}"`);
      return callback(new Error('Origin format is invalid.'));
    }

    // Check if the incoming request's hostname is in our allowed set
    if (allowedHostnames.has(originHostname)) {
      return callback(null, true);
    }

    // If we've reached here, the origin is not allowed.
    console.error(`[CORS] Rejected origin: "${origin}". Hostname "${originHostname}" is not in the allowed list.`);
    return callback(new Error('Not allowed by CORS'));
  }
}));


// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

app.use('/api/emissao-nfse-treinamento', emissaoNfseTreinamentoRouter);


// --- In-memory storage for the last subscription ---
let lastSubscription = null;


// --- API Routes ---

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// [NEW] Endpoint to expose the public VAPID key for frontend verification
app.get('/api/vapid-key', (req, res) => {
  res.status(200).json({ publicKey: vapidKeys.publicKey });
});

// Middleware for API Token Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

  if (token == null) {
    return res.status(401).json({ ok: false, reason: 'Authorization token is required' });
  }

  if (token !== process.env.API_TOKEN) {
    return res.status(403).json({ ok: false, reason: 'Invalid authorization token' });
  }

  next();
};

// Register a subscription from the frontend
app.post('/api/push/register', (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ ok: false, reason: 'Invalid subscription object' });
    }
    lastSubscription = subscription;
    console.log('[Server] New subscription registered.');
    res.status(201).json({ ok: true });
});

// Get the last registered subscription
app.get('/api/push/last-subscription', (req, res) => {
    if (lastSubscription) {
        res.status(200).json(lastSubscription);
    } else {
        res.status(404).json({ ok: false, reason: 'No subscription registered yet' });
    }
});

// Delete the last registered subscription
app.delete('/api/push/last-subscription', (req, res) => {
    console.log('[Server] Last subscription has been cleared.');
    lastSubscription = null;
    res.status(200).json({ ok: true });
});

// Simple push endpoint
app.post('/api/push/simple', authenticateToken, async (req, res) => {
    if (!lastSubscription) {
        return res.status(400).json({ ok: false, reason: 'No subscription is registered on the server.' });
    }

    const { title, body } = req.body;
    if (!title || !body) {
        return res.status(400).json({ ok: false, reason: 'Request must include "title" and "body".' });
    }

    const notificationPayload = JSON.stringify({ title, body });

    try {
        const pushResult = await webpush.sendNotification(lastSubscription, notificationPayload);
        res.status(200).json({ ok: true, status: pushResult.statusCode });
    } catch (err) {
        console.error('Error sending simple push notification:', err.body || err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
            lastSubscription = null; // Clean up expired subscription
            return res.status(410).json({ ok: false, status: err.statusCode, reason: 'Subscription is invalid or expired. It has been removed.' });
        }
        res.status(500).json({ ok: false, status: err.statusCode, reason: 'Failed to send notification' });
    }
});


// Detailed push endpoint
app.post('/api/push/send', authenticateToken, async (req, res) => {
  const { subscription, notification } = req.body;

  // Validate subscription
  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ ok: false, reason: 'Invalid subscription object' });
  }

  // Validate notification payload
  if (!notification || !notification.title || !notification.body) {
    return res.status(400).json({ ok: false, reason: 'Notification object must contain title and body' });
  }

  const payload = JSON.stringify(notification);
  const options = {
    ttl: notification.ttl || 60,
  };

  try {
    const pushResult = await webpush.sendNotification(subscription, payload, options);
    res.status(200).json({ ok: true, status: pushResult.statusCode });
  } catch (err) {
    console.error('Error sending push notification:', err.body || err.message);
    if (err.statusCode === 410 || err.statusCode === 404) {
      return res.status(410).json({ ok: false, status: err.statusCode, reason: 'Subscription gone or invalid' });
    }
    res.status(500).json({ ok: false, status: err.statusCode || 500, reason: 'Failed to send notification' });
  }
});


// --- Serve SPA ---
app.post('/api/chatkit/session', async (req, res) => {
  if (!chatkitWorkflowId) {
    return res.status(500).json({ error: 'CHATKIT_WORKFLOW_ID is not configured on the server.' });
  }

  const requestedWorkflow =
    typeof req.body?.workflowId === 'string' && req.body.workflowId.trim()
      ? req.body.workflowId.trim()
      : chatkitWorkflowId;

  const baseUser =
    (typeof req.body?.user === 'string' && req.body.user.trim()) ||
    req.ip ||
    'dematec-user';
  const sanitizedUser = baseUser.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
  const userId = `${sanitizedUser || 'dematec-user'}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase();

  console.info('[ChatKit] Session request received', {
    at: new Date().toISOString(),
    requestedWorkflow,
    fallbackWorkflow: chatkitWorkflowId,
    hasBody: Boolean(req.body),
    bodyKeys: req.body ? Object.keys(req.body) : [],
    userId,
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
  });

  try {
    const session = await openai.beta.chatkit.sessions.create({
      user: userId,
      workflow: { id: requestedWorkflow },
      chatkit_configuration: {
        file_upload: {
          enabled: true,
        },
      },
    });

    console.info('[ChatKit] Session created successfully', {
      at: new Date().toISOString(),
      sessionId: session.id,
      workflow: requestedWorkflow,
      expiresAt: session.expires_at,
      maxRequestsPerMinute: session.max_requests_per_1_minute,
    });

    return res.status(200).json({
      client_secret: session.client_secret,
      session_id: session.id,
      expires_at: session.expires_at,
    });
  } catch (error) {
    const statusCode = typeof error?.status === 'number' ? error.status : 500;
    const detail =
      (error?.error &&
        typeof error.error === 'object' &&
        'message' in error.error &&
        error.error.message) ||
      error?.message ||
      'Failed to create ChatKit session.';
    const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    const errorPayload = {
      at: new Date().toISOString(),
      message: detail,
      statusCode,
      safeStatus,
      name: error?.name,
      type: typeof error,
      responseBody: error?.response?.body,
      responseHeaders: error?.response?.headers,
    };
    console.error('[ChatKit] Failed to create session', errorPayload);
    return res.status(safeStatus).json({ error: detail });
  }
});

// This should be the last route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});


// --- Start Server ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
