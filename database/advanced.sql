-- ============================================================================
-- PLANETARIUM DB - Advanced Database Objects & Analytical Queries
-- DBMS: PostgreSQL
-- Includes:
-- 1. Optimized View for Three.js rendering with aggregated moon data
-- 2. Trigger & Trigger Function for automatic audit logging
-- 3. Transactional Stored Procedure for atomic planet + moons insertion
-- 4. Five Core Analytical Queries (JOINs, Aggregations, HAVING, Subqueries)
-- ============================================================================

-- ============================================================================
-- 1. VIEW: planet_render_view
-- ----------------------------------------------------------------------------
-- What it does:
-- Joins planets with stars and planet_types, and computes the total moon count
-- using a LEFT JOIN and COUNT().
-- Why it's useful for the project:
-- The Express backend and Three.js frontend can query this single view
-- to get all rendering attributes (size, distance, color, speed, star name, type)
-- and satellite count without writing messy multiple JOINs in application code.
-- ============================================================================
CREATE OR REPLACE VIEW planet_render_view AS
SELECT 
    p.planet_id,
    p.name AS planet_name,
    p.radius_km,
    p.orbit_radius_au,
    p.orbital_period_days,
    p.rotation_period_hours,
    p.mass_earth_masses,
    p.has_rings,
    p.color_hex,
    p.texture_url,
    s.star_id,
    s.name AS star_name,
    pt.type_id,
    pt.type_name,
    COUNT(DISTINCT m.moon_id) AS total_moons,
    COALESCE(
        json_agg(
            DISTINCT jsonb_build_object(
                'moon_id', m.moon_id,
                'name', m.name,
                'radius_km', m.radius_km,
                'orbit_radius_km', m.orbit_radius_km,
                'orbital_period_days', m.orbital_period_days,
                'color_hex', m.color_hex
            )
        ) FILTER (WHERE m.moon_id IS NOT NULL),
        '[]'::json
    ) AS moons_list,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'gas_name', g.name,
                    'formula', g.chemical_formula,
                    'percentage', pa.percentage
                )
                ORDER BY pa.percentage DESC
            )
            FROM planet_atmosphere pa
            JOIN gases g ON pa.gas_id = g.gas_id
            WHERE pa.planet_id = p.planet_id
        ),
        '[]'::json
    ) AS atmosphere,
    COALESCE(
        (
            SELECT json_build_object(
                'discoverer', d.discoverer,
                'discovery_year', d.discovery_year,
                'discovery_method', d.discovery_method,
                'notes', d.notes
            )
            FROM discoveries d
            WHERE d.planet_id = p.planet_id
        ),
        '{}'::json
    ) AS discovery_info,
    p.created_at
FROM planets p
INNER JOIN stars s ON p.star_id = s.star_id
INNER JOIN planet_types pt ON p.type_id = pt.type_id
LEFT JOIN moons m ON p.planet_id = m.planet_id
GROUP BY 
    p.planet_id,
    p.name,
    p.radius_km,
    p.orbit_radius_au,
    p.orbital_period_days,
    p.rotation_period_hours,
    p.mass_earth_masses,
    p.has_rings,
    p.color_hex,
    p.texture_url,
    s.star_id,
    s.name,
    pt.type_id,
    pt.type_name,
    p.created_at;


-- ============================================================================
-- 2. TRIGGER & FUNCTION: audit_planets_changes & REAL-TIME NOTIFICATIONS
-- ----------------------------------------------------------------------------
-- What it does:
-- 1) Audit Logging: Records INSERT/UPDATE/DELETE events into `audit_log`.
-- 2) Real-time NOTIFY (pg_notify): Broadcasts an asynchronous notification on channel
--    'planetarium_channel' carrying a JSON payload (table, action, record id, timestamp).
--
-- How PostgreSQL LISTEN / NOTIFY works (Key Viva Concept):
-- - PostgreSQL has a built-in asynchronous inter-process communication (IPC) pub/sub system.
-- - When data changes, pg_notify('channel_name', payload) sends a message to the PostgreSQL engine.
-- - External clients (like our Express server) maintain a persistent dedicated client connection
--   executing `LISTEN channel_name`.
-- - When a transaction commits, Postgres pushes the notification payload to all listening clients
--   instantly without polling!
-- - Express then streams this event to web browsers using Server-Sent Events (SSE).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_audit_planets()
RETURNS TRIGGER AS $$
DECLARE
    target_id INT;
    payload JSONB;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        target_id := NEW.planet_id;
        INSERT INTO audit_log (table_name, action_type, record_id, old_data, new_data, performed_by, timestamp)
        VALUES ('planets', 'INSERT', target_id, NULL, to_jsonb(NEW), CURRENT_USER, CURRENT_TIMESTAMP);
        
        payload := jsonb_build_object(
            'table', 'planets',
            'action', 'INSERT',
            'id', target_id,
            'timestamp', CURRENT_TIMESTAMP
        );
        PERFORM pg_notify('planetarium_channel', payload::text);
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        target_id := NEW.planet_id;
        INSERT INTO audit_log (table_name, action_type, record_id, old_data, new_data, performed_by, timestamp)
        VALUES ('planets', 'UPDATE', target_id, to_jsonb(OLD), to_jsonb(NEW), CURRENT_USER, CURRENT_TIMESTAMP);
        
        payload := jsonb_build_object(
            'table', 'planets',
            'action', 'UPDATE',
            'id', target_id,
            'timestamp', CURRENT_TIMESTAMP
        );
        PERFORM pg_notify('planetarium_channel', payload::text);
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        target_id := OLD.planet_id;
        INSERT INTO audit_log (table_name, action_type, record_id, old_data, new_data, performed_by, timestamp)
        VALUES ('planets', 'DELETE', target_id, to_jsonb(OLD), NULL, CURRENT_USER, CURRENT_TIMESTAMP);
        
        payload := jsonb_build_object(
            'table', 'planets',
            'action', 'DELETE',
            'id', target_id,
            'timestamp', CURRENT_TIMESTAMP
        );
        PERFORM pg_notify('planetarium_channel', payload::text);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to planets table
DROP TRIGGER IF EXISTS trg_audit_planets ON planets;
CREATE TRIGGER trg_audit_planets
AFTER INSERT OR UPDATE OR DELETE ON planets
FOR EACH ROW
EXECUTE FUNCTION fn_audit_planets();

-- Trigger for changes on moons to notify frontend of moon addition/removal
CREATE OR REPLACE FUNCTION fn_notify_moons()
RETURNS TRIGGER AS $$
DECLARE
    affected_planet_id INT;
    payload JSONB;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        affected_planet_id := OLD.planet_id;
    ELSE
        affected_planet_id := NEW.planet_id;
    END IF;

    payload := jsonb_build_object(
        'table', 'moons',
        'action', TG_OP,
        'planet_id', affected_planet_id,
        'timestamp', CURRENT_TIMESTAMP
    );
    PERFORM pg_notify('planetarium_channel', payload::text);

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_moons ON moons;
CREATE TRIGGER trg_notify_moons
AFTER INSERT OR UPDATE OR DELETE ON moons
FOR EACH ROW
EXECUTE FUNCTION fn_notify_moons();



-- ============================================================================
-- 3. STORED PROCEDURE / FUNCTION: add_planet_with_moons
-- ----------------------------------------------------------------------------
-- What it does:
-- Inserts a new planet and an array of moon objects (JSON) within a single
-- atomic operation. If any moon fails constraint validation (e.g., negative radius),
-- the entire transaction is rolled back, preventing orphaned or half-inserted data.
--
-- Example call:
-- SELECT add_planet_with_moons(
--     1, 1, 'Kepler-452b', 9500.0, 1.046, 384.84, 24.0, 5.0, FALSE, '#4A90E2',
--     '[{"name": "Moon Alpha", "radius_km": 1200.0, "orbit_radius_km": 200000.0, "orbital_period_days": 14.5}]'::jsonb
-- );
-- ============================================================================

CREATE OR REPLACE FUNCTION add_planet_with_moons(
    p_star_id INT,
    p_type_id INT,
    p_name VARCHAR(100),
    p_radius_km NUMERIC,
    p_orbit_radius_au NUMERIC,
    p_orbital_period_days NUMERIC,
    p_rotation_period_hours NUMERIC,
    p_mass_earth_masses NUMERIC,
    p_has_rings BOOLEAN,
    p_color_hex VARCHAR(7),
    p_moons JSONB DEFAULT '[]'::jsonb
)
RETURNS INT AS $$
DECLARE
    new_planet_id INT;
    moon_item JSONB;
BEGIN
    -- 1. Insert Planet
    INSERT INTO planets (
        star_id, type_id, name, radius_km, orbit_radius_au,
        orbital_period_days, rotation_period_hours, mass_earth_masses,
        has_rings, color_hex
    ) VALUES (
        p_star_id, p_type_id, p_name, p_radius_km, p_orbit_radius_au,
        p_orbital_period_days, p_rotation_period_hours, p_mass_earth_masses,
        p_has_rings, p_color_hex
    ) RETURNING planet_id INTO new_planet_id;

    -- 2. Insert Moons if array is provided
    IF jsonb_array_length(p_moons) > 0 THEN
        FOR moon_item IN SELECT * FROM jsonb_array_elements(p_moons)
        LOOP
            INSERT INTO moons (
                planet_id,
                name,
                radius_km,
                orbit_radius_km,
                orbital_period_days,
                color_hex
            ) VALUES (
                new_planet_id,
                moon_item->>'name',
                (moon_item->>'radius_km')::NUMERIC,
                (moon_item->>'orbit_radius_km')::NUMERIC,
                (moon_item->>'orbital_period_days')::NUMERIC,
                COALESCE(moon_item->>'color_hex', '#CCCCCC')
            );
        END LOOP;
    END IF;

    -- Returns the created planet ID
    RETURN new_planet_id;

EXCEPTION
    WHEN OTHERS THEN
        -- PostgreSQL functions automatically roll back all changes in the current subxact on error
        RAISE EXCEPTION 'Failed to add planet and moons: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. FIVE ANALYTIC QUERIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- QUERY 1: Heaviest Planet (Subquery + JOIN)
-- Simple Explanation:
-- Finds the planet with the maximum mass by comparing each planet's mass
-- against the maximum mass obtained from an inner subquery.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- QUERY 2: Total Planets per Star (GROUP BY + LEFT JOIN)
-- Simple Explanation:
-- Aggregates star systems and counts how many planets belong to each star.
-- A LEFT JOIN ensures stars with zero planets are still counted (reporting 0).
-- ----------------------------------------------------------------------------
SELECT 
    s.star_id,
    s.name AS star_name,
    s.spectral_type,
    COUNT(p.planet_id) AS total_planets
FROM stars s
LEFT JOIN planets p ON s.star_id = p.star_id
GROUP BY s.star_id, s.name, s.spectral_type
ORDER BY total_planets DESC;

-- ----------------------------------------------------------------------------
-- QUERY 3: Average Orbit Radius per Planet Type (GROUP BY + Aggregate)
-- Simple Explanation:
-- Groups planets by their classification (Terrestrial, Gas Giant, etc.)
-- and calculates the average distance from the Sun in Astronomical Units (AU).
-- ----------------------------------------------------------------------------
SELECT 
    pt.type_name,
    COUNT(p.planet_id) AS total_planets,
    ROUND(AVG(p.orbit_radius_au), 2) AS avg_orbit_radius_au,
    ROUND(MIN(p.orbit_radius_au), 2) AS min_orbit_radius_au,
    ROUND(MAX(p.orbit_radius_au), 2) AS max_orbit_radius_au
FROM planet_types pt
JOIN planets p ON pt.type_id = p.type_id
GROUP BY pt.type_id, pt.type_name
ORDER BY avg_orbit_radius_au ASC;

-- ----------------------------------------------------------------------------
-- QUERY 4: Planets with the Most Moons (GROUP BY + HAVING)
-- Simple Explanation:
-- Groups moons by their parent planet and filters out planets that have at least
-- 2 moons using HAVING. Orders descending to put the planet with most moons on top.
-- ----------------------------------------------------------------------------
SELECT 
    p.planet_id,
    p.name AS planet_name,
    pt.type_name,
    COUNT(m.moon_id) AS moon_count
FROM planets p
JOIN planet_types pt ON p.type_id = pt.type_id
JOIN moons m ON p.planet_id = m.planet_id
GROUP BY p.planet_id, p.name, pt.type_name
HAVING COUNT(m.moon_id) >= 2
ORDER BY moon_count DESC;

-- ----------------------------------------------------------------------------
-- QUERY 5: Planets with No Atmosphere Data (Correlated NOT EXISTS Subquery)
-- Simple Explanation:
-- Identifies planets that have no corresponding records in the planet_atmosphere
-- junction table (such as Mercury, which has an exosphere rather than a stable atmosphere).
-- ----------------------------------------------------------------------------
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
