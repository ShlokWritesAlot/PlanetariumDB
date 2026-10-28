const db = require('../config/db');
const { handleDatabaseError } = require('../utils/dbErrorHandler');

/**
 * GET /api/planets
 * Retrieves all planets from planet_render_view (joined with star, type, and aggregated moons)
 */
async function getAllPlanets(req, res) {
    try {
        const queryText = `
            SELECT 
                planet_id,
                planet_name,
                radius_km,
                orbit_radius_au,
                orbital_period_days,
                rotation_period_hours,
                mass_earth_masses,
                has_rings,
                color_hex,
                texture_url,
                star_id,
                star_name,
                type_id,
                type_name,
                total_moons,
                moons_list,
                atmosphere,
                discovery_info,
                created_at
            FROM planet_render_view
            ORDER BY orbit_radius_au ASC;
        `;
        const { rows } = await db.query(queryText);
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

/**
 * POST /api/planets
 * Inserts a single planet using parameterized queries
 */
async function createPlanet(req, res) {
    try {
        const {
            star_id = 1,
            type_id = 1,
            name,
            radius_km,
            orbit_radius_au,
            orbital_period_days,
            rotation_period_hours = 24.0,
            mass_earth_masses = 1.0,
            has_rings = false,
            color_hex = '#4A90E2',
            texture_url = null
        } = req.body;

        const insertQuery = `
            INSERT INTO planets (
                star_id, type_id, name, radius_km, orbit_radius_au,
                orbital_period_days, rotation_period_hours, mass_earth_masses,
                has_rings, color_hex, texture_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *;
        `;

        const values = [
            star_id,
            type_id,
            name,
            radius_km,
            orbit_radius_au,
            orbital_period_days,
            rotation_period_hours,
            mass_earth_masses,
            has_rings,
            color_hex,
            texture_url
        ];

        const { rows } = await db.query(insertQuery, values);
        res.status(201).json({
            success: true,
            message: `Planet '${rows[0].name}' created successfully.`,
            data: rows[0]
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

/**
 * PUT /api/planets/:id
 * Updates an existing planet
 */
async function updatePlanet(req, res) {
    try {
        const planetId = parseInt(req.params.id, 10);
        const {
            star_id,
            type_id,
            name,
            radius_km,
            orbit_radius_au,
            orbital_period_days,
            rotation_period_hours,
            mass_earth_masses,
            has_rings,
            color_hex,
            texture_url
        } = req.body;

        const updateQuery = `
            UPDATE planets
            SET 
                star_id = COALESCE($1, star_id),
                type_id = COALESCE($2, type_id),
                name = COALESCE($3, name),
                radius_km = COALESCE($4, radius_km),
                orbit_radius_au = COALESCE($5, orbit_radius_au),
                orbital_period_days = COALESCE($6, orbital_period_days),
                rotation_period_hours = COALESCE($7, rotation_period_hours),
                mass_earth_masses = COALESCE($8, mass_earth_masses),
                has_rings = COALESCE($9, has_rings),
                color_hex = COALESCE($10, color_hex),
                texture_url = COALESCE($11, texture_url)
            WHERE planet_id = $12
            RETURNING *;
        `;

        const values = [
            star_id,
            type_id,
            name,
            radius_km,
            orbit_radius_au,
            orbital_period_days,
            rotation_period_hours,
            mass_earth_masses,
            has_rings,
            color_hex,
            texture_url,
            planetId
        ];

        const { rows } = await db.query(updateQuery, values);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: `Planet with ID ${planetId} not found.` });
        }

        res.json({
            success: true,
            message: `Planet '${rows[0].name}' updated successfully.`,
            data: rows[0]
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

/**
 * DELETE /api/planets/:id
 * Deletes a planet (cascades to moons, atmosphere, discoveries)
 */
async function deletePlanet(req, res) {
    try {
        const planetId = parseInt(req.params.id, 10);
        const deleteQuery = `DELETE FROM planets WHERE planet_id = $1 RETURNING *;`;
        const { rows } = await db.query(deleteQuery, [planetId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: `Planet with ID ${planetId} not found.` });
        }

        res.json({
            success: true,
            message: `Planet '${rows[0].name}' and all dependent records (moons, atmosphere, discoveries) were deleted (CASCADE).`,
            data: rows[0]
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

/**
 * POST /api/planets/with-moons
 * Atomic transaction insertion using the stored procedure add_planet_with_moons()
 */
async function createPlanetWithMoons(req, res) {
    try {
        const {
            star_id = 1,
            type_id = 1,
            name,
            radius_km,
            orbit_radius_au,
            orbital_period_days,
            rotation_period_hours = 24.0,
            mass_earth_masses = 1.0,
            has_rings = false,
            color_hex = '#4A90E2',
            moons = []
        } = req.body;

        const procQuery = `
            SELECT add_planet_with_moons($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) AS new_planet_id;
        `;

        const values = [
            star_id,
            type_id,
            name,
            radius_km,
            orbit_radius_au,
            orbital_period_days,
            rotation_period_hours,
            mass_earth_masses,
            has_rings,
            color_hex,
            JSON.stringify(moons)
        ];

        const { rows } = await db.query(procQuery, values);
        const newPlanetId = rows[0].new_planet_id;

        // Fetch full record from view
        const fetchQuery = `SELECT * FROM planet_render_view WHERE planet_id = $1;`;
        const fetchResult = await db.query(fetchQuery, [newPlanetId]);

        res.status(201).json({
            success: true,
            message: `Planet '${name}' and ${moons.length} moon(s) created atomically.`,
            data: fetchResult.rows[0]
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
}

module.exports = {
    getAllPlanets,
    createPlanet,
    updatePlanet,
    deletePlanet,
    createPlanetWithMoons
};
