const { Client } = require('pg');
require('dotenv').config();

/**
 * Real-time SSE Manager using PostgreSQL LISTEN / NOTIFY
 * 
 * ============================================================================
 * HOW POSTGRESQL LISTEN / NOTIFY WORKS (VIVA EXPLANATION):
 * ============================================================================
 * 1. PostgreSQL includes a built-in publish/subscribe (pub/sub) messaging system.
 * 2. When a SQL query modifies the database (INSERT/UPDATE/DELETE), our database
 *    triggers (`trg_audit_planets`, `trg_notify_moons`) call `pg_notify('planetarium_channel', payload)`.
 * 3. `pg_notify` runs within the same database transaction. When that transaction
 *    COMMITS, PostgreSQL broadcasts the notification to all clients that have
 *    registered interest.
 * 4. In Node.js, we maintain a dedicated, persistent PostgreSQL Client connection
 *    (separate from the general query pool) executing: `LISTEN planetarium_channel`.
 * 5. When Postgres delivers a notification event to this client, the client fires
 *    a `'notification'` event in JavaScript.
 * 6. We then broadcast this payload to all connected browsers over HTTP using
 *    Server-Sent Events (SSE) at `/api/events`.
 * 7. Advantage: ZERO database polling, minimal CPU/network overhead, and instant
 *    UI updates in milliseconds!
 * ============================================================================
 */

// Set of active SSE client response streams
const sseClients = new Set();

// Dedicated PostgreSQL client for listening (must remain open and not be pooled for queries)
const listenerClient = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'planetarium_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
});

async function startNotificationListener() {
    try {
        await listenerClient.connect();
        console.log('📡 Dedicated PostgreSQL notification client connected.');

        // Subscribe to the channel defined in our database trigger
        await listenerClient.query('LISTEN planetarium_channel');
        console.log("👂 Listening for notifications on channel: 'planetarium_channel'");

        listenerClient.on('notification', (msg) => {
            console.log(`⚡ Received Postgres NOTIFY on [${msg.channel}]:`, msg.payload);

            let parsedPayload;
            try {
                parsedPayload = JSON.parse(msg.payload);
            } catch (e) {
                parsedPayload = { raw: msg.payload };
            }

            // Broadcast to all active browser SSE streams
            broadcastSSE({
                event: 'db_change',
                data: parsedPayload,
                timestamp: new Date().toISOString()
            });
        });

        listenerClient.on('error', (err) => {
            console.error('Postgres listener client error:', err.message);
        });

    } catch (err) {
        console.error('⚠️ Could not start PostgreSQL LISTEN client:', err.message);
    }
}

/**
 * SSE Route Handler for GET /api/events
 */
function handleSSEConnection(req, res) {
    // Set headers required for Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Send initial handshake message to confirm stream is established
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE stream established with Planetarium DB' })}\n\n`);

    // Register this client
    sseClients.add(res);

    // Keep connection alive with periodic comment pings every 25 seconds
    const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
    }, 25000);

    // Clean up when client disconnects (tab closed, navigated away)
    req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
    });
}

/**
 * Broadcasts an SSE message to all connected browsers
 */
function broadcastSSE(messageObject) {
    const sseFormattedData = `data: ${JSON.stringify(messageObject)}\n\n`;
    for (const client of sseClients) {
        client.write(sseFormattedData);
    }
}

module.exports = {
    startNotificationListener,
    handleSSEConnection,
    broadcastSSE
};
