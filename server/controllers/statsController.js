const db = require('../config/db');
const { handleDatabaseError } = require('../utils/dbErrorHandler');

/**
 * GET /api/stats
 * Executes and returns the five analytic queries
 */
async function getAnalyticsStats(req, res) {
    try {
        // Query 1: Heaviest planet
        const heaviestPlanetQuery = `
            SELECT 
                p.planet_id,
                p.name AS planet_name,
                p.mass_earth_masses,
                pt.type_name,
                s.name AS star_name
            FROM planets p
            JOIN planet_types pt ON p.type_id = pt.type_id
            JOIN stars s ON p.star_id = s.star_id
            WHERE p.mass_earth_masses = (
                SELECT MAX(mass_earth_masses) FROM planets
            );
        `;

        // Query 2: Planets per star
        const planetsPerStarQuery = `
            SELECT 
                s.star_id,
                s.name AS star_name,
                s.spectral_type,
                COUNT(p.planet_id)::int AS total_planets
            FROM stars s
            LEFT JOIN planets p ON s.star_id = p.star_id
            GROUP BY s.star_id, s.name, s.spectral_type
            ORDER BY total_planets DESC;
        `;

        // Query 3: Average orbit radius per planet type
        const avgOrbitPerTypeQuery = `
            SELECT 
                pt.type_name,
                COUNT(p.planet_id)::int AS total_planets,
                ROUND(AVG(p.orbit_radius_au), 2)::float AS avg_orbit_radius_au,
                ROUND(MIN(p.orbit_radius_au), 2)::float AS min_orbit_radius_au,
                ROUND(MAX(p.orbit_radius_au), 2)::float AS max_orbit_radius_au
            FROM planet_types pt
            JOIN planets p ON pt.type_id = p.type_id
            GROUP BY pt.type_id, pt.type_name
            ORDER BY avg_orbit_radius_au ASC;
        `;

        // Query 4: Planets with the most moons (HAVING count >= 2)
        const mostMoonsQuery = `
            SELECT 
                p.planet_id,
                p.name AS planet_name,
                pt.type_name,
                COUNT(m.moon_id)::int AS moon_count
            FROM planets p
            JOIN planet_types pt ON p.type_id = pt.type_id
            JOIN moons m ON p.planet_id = m.planet_id
            GROUP BY p.planet_id, p.name, pt.type_name
            HAVING COUNT(m.moon_id) >= 2
            ORDER BY moon_count DESC;
        `;

        // Query 5: Planets with no atmosphere data (correlated NOT EXISTS)
        const noAtmosphereQuery = `
            SELECT 
                p.planet_id,
                p.name AS planet_name,
                pt.type_name,
                p.radius_km
            FROM planets p
            JOIN planet_types pt ON p.type_id = pt.type_id
            WHERE NOT EXISTS (
                SELECT 1 
                FROM planet_atmosphere pa 
                WHERE pa.planet_id = p.planet_id
            );
        `;

        // Execute all in parallel
        const [
            heaviestRes,
            planetsPerStarRes,
            avgOrbitRes,
            mostMoonsRes,
            noAtmoRes
        ] = await Promise.all([
            db.query(heaviestPlanetQuery),
            db.query(planetsPerStarQuery),
            db.query(avgOrbitPerTypeQuery),
            db.query(mostMoonsQuery),
            db.query(noAtmosphereQuery)
        ]);

        res.json({
            success: true,
            data: {
                heaviestPlanet: heaviestRes.rows[0] || null,
                planetsPerStar: planetsPerStarRes.rows,
                averageOrbitRadiusPerType: avgOrbitRes.rows,
                planetsWithMostMoons: mostMoonsRes.rows,
                planetsWithoutAtmosphere: noAtmoRes.rows
            }
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

/**
 * GET /api/audit
 * Returns recent records from audit_log
 */
async function getAuditLogs(req, res) {
    try {
        const limit = parseInt(req.query.limit || '50', 10);
        const queryText = `
            SELECT 
                log_id,
                table_name,
                action_type,
                record_id,
                old_data,
                new_data,
                performed_by,
                timestamp
            FROM audit_log
            ORDER BY timestamp DESC
            LIMIT $1;
        `;
        const { rows } = await db.query(queryText, [limit]);
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

/**
 * POST /api/query
 * Executes a strictly READ-ONLY SQL query for live viva demonstrations.
 * Validates that only SELECT queries are permitted and rejects any DDL / DML.
 * Runs inside a read-only PostgreSQL transaction for defense-in-depth.
 */
async function executeReadOnlyQuery(req, res) {
    const { query: sqlQuery } = req.body;

    if (!sqlQuery || typeof sqlQuery !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Missing query parameter',
            detail: 'Please provide a SQL query string.'
        });
    }

    const trimmed = sqlQuery.trim();

    // 1. Regex check: MUST start with SELECT or WITH (Common Table Expressions)
    const isSelect = /^(SELECT|WITH)\s+/i.test(trimmed);
    // 2. Reject dangerous keywords (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE)
    const hasForbiddenKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|VACUUM)\b/i.test(trimmed);

    if (!isSelect || hasForbiddenKeywords) {
        return res.status(403).json({
            success: false,
            error: 'Security Policy Violation: Read-Only Console',
            detail: 'Only SELECT queries are permitted in the interactive live demo console.'
        });
    }

    // 3. Execution inside a READ ONLY PostgreSQL transaction
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN READ ONLY;');
        const startTime = Date.now();
        const result = await client.query(trimmed);
        const executionTimeMs = Date.now() - startTime;
        await client.query('COMMIT;');

        res.json({
            success: true,
            executionTimeMs,
            rowCount: result.rowCount,
            fields: result.fields ? result.fields.map(f => f.name) : [],
            data: result.rows
        });
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => {});
        handleDatabaseError(err, res);
    } finally {
        client.release();
    }
}

module.exports = {
    getAnalyticsStats,
    getAuditLogs,
    executeReadOnlyQuery
};
