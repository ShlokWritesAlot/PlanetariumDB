const express = require('express');
const cors = require('cors');
const path = require('path');
const planetRoutes = require('./routes/planetRoutes');
const statsRoutes = require('./routes/statsRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from client directory (or public fallback)
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/planets', planetRoutes);
app.use('/api', statsRoutes);

// Server-Sent Events (SSE) endpoint powered by PostgreSQL LISTEN/NOTIFY
const { handleSSEConnection } = require('./services/sseService');
app.get('/api/events', handleSSEConnection);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Root fallback to frontend
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    const clientPath = path.join(__dirname, '../client/index.html');
    res.sendFile(clientPath);
});

module.exports = app;
