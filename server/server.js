require('dotenv').config();
const app = require('./app');
const db = require('./config/db');

const PORT = process.env.PORT || 3000;

const { startNotificationListener } = require('./services/sseService');

// Test DB connection before listening
db.pool.connect(async (err, client, release) => {
    if (err) {
        console.error('⚠️  Failed to connect to PostgreSQL database:', err.message);
        console.error('Please verify your .env settings and ensure PostgreSQL is running.');
    } else {
        console.log(' Connected to PostgreSQL database successfully.');
        release();

        // Start dedicated PostgreSQL LISTEN client for real-time notifications
        await startNotificationListener();
    }

    app.listen(PORT, () => {
        console.log(` Planetarium DB server running on http://localhost:${PORT}`);
    });
});
