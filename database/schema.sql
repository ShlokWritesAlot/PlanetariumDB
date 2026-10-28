-- ============================================================================
-- PLANETARIUM DB - Database Schema
-- DBMS: PostgreSQL
-- Normalization: 3NF (Third Normal Form)
-- ============================================================================

-- Clean up existing tables if any (ordered to respect foreign key dependencies)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS planet_atmosphere CASCADE;
DROP TABLE IF EXISTS gases CASCADE;
DROP TABLE IF EXISTS discoveries CASCADE;
DROP TABLE IF EXISTS moons CASCADE;
DROP TABLE IF EXISTS planets CASCADE;
DROP TABLE IF EXISTS planet_types CASCADE;
DROP TABLE IF EXISTS stars CASCADE;

-- ============================================================================
-- 1. STARS TABLE
-- 3NF Rationale: Represents central celestial bodies (parent to planetary systems).
-- Every non-key attribute (name, spectral_type, mass_solar_masses, radius_solar_radii)
-- depends directly and solely on the primary key (star_id), with no transitive dependencies.
-- ============================================================================
CREATE TABLE stars (
    star_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    spectral_type VARCHAR(10) NOT NULL, -- e.g., 'G2V', 'M1V'
    mass_solar_masses NUMERIC(8, 4) NOT NULL CHECK (mass_solar_masses > 0),
    radius_solar_radii NUMERIC(8, 4) NOT NULL CHECK (radius_solar_radii > 0),
    temperature_kelvin NUMERIC(8, 2) CHECK (temperature_kelvin > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. PLANET_TYPES TABLE (Lookup / Reference Table)
-- 3NF Rationale: Extracted to eliminate transitive redundancy from the planets table.
-- Storing type descriptions directly in `planets` would violate 2NF/3NF because
-- description depends on type, not on the planet itself.
-- ============================================================================
CREATE TABLE planet_types (
    type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'Terrestrial', 'Gas Giant', 'Ice Giant', 'Dwarf'
    description TEXT
);

-- ============================================================================
-- 3. PLANETS TABLE
-- 3NF Rationale: Each row represents a single planet. All attributes (physical,
-- orbital, and visual properties for Three.js rendering) depend strictly on the
-- primary key (planet_id). Foreign keys link to stars and planet_types.
-- ============================================================================
CREATE TABLE planets (
    planet_id SERIAL PRIMARY KEY,
    star_id INT NOT NULL REFERENCES stars(star_id) ON DELETE RESTRICT,
    type_id INT NOT NULL REFERENCES planet_types(type_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL UNIQUE,
    radius_km NUMERIC(10, 2) NOT NULL CHECK (radius_km > 0),
    orbit_radius_au NUMERIC(8, 4) NOT NULL CHECK (orbit_radius_au > 0),
    orbital_period_days NUMERIC(10, 2) NOT NULL CHECK (orbital_period_days > 0),
    rotation_period_hours NUMERIC(10, 2),
    mass_earth_masses NUMERIC(10, 4) CHECK (mass_earth_masses > 0),
    has_rings BOOLEAN DEFAULT FALSE,
    color_hex VARCHAR(7) NOT NULL DEFAULT '#FFFFFF', -- Used by Three.js material
    texture_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. MOONS TABLE
-- 3NF Rationale: Represents natural satellites orbiting a planet.
-- Every attribute depends solely on moon_id. Foreign key planet_id maps to
-- the parent planet with ON DELETE CASCADE so removing a planet deletes its moons.
-- ============================================================================
CREATE TABLE moons (
    moon_id SERIAL PRIMARY KEY,
    planet_id INT NOT NULL REFERENCES planets(planet_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    radius_km NUMERIC(10, 2) NOT NULL CHECK (radius_km > 0),
    orbit_radius_km NUMERIC(12, 2) NOT NULL CHECK (orbit_radius_km > 0),
    orbital_period_days NUMERIC(10, 4) NOT NULL CHECK (orbital_period_days > 0),
    color_hex VARCHAR(7) DEFAULT '#CCCCCC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_moon_per_planet UNIQUE (planet_id, name)
);

-- ============================================================================
-- 5. GASES TABLE (Lookup / Reference Table)
-- 3NF Rationale: Master catalog of atmospheric chemical elements/compounds.
-- Attributes (chemical_formula, molecular_weight) depend strictly on gas_id.
-- ============================================================================
CREATE TABLE gases (
    gas_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    chemical_formula VARCHAR(20) NOT NULL UNIQUE, -- e.g., 'N2', 'O2', 'CO2', 'CH4'
    molecular_weight NUMERIC(8, 4) CHECK (molecular_weight > 0)
);

-- ============================================================================
-- 6. PLANET_ATMOSPHERE TABLE (Many-to-Many Junction Table)
-- 3NF Rationale: Resolves many-to-many relationship between planets and gases.
-- Composite primary key (planet_id, gas_id). The non-key attribute 'percentage'
-- represents the intersection fact and depends directly on the entire composite key.
-- ON DELETE CASCADE ensures atmospheric records are removed if the planet is deleted.
-- ============================================================================
CREATE TABLE planet_atmosphere (
    planet_id INT NOT NULL REFERENCES planets(planet_id) ON DELETE CASCADE,
    gas_id INT NOT NULL REFERENCES gases(gas_id) ON DELETE RESTRICT,
    percentage NUMERIC(5, 2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    PRIMARY KEY (planet_id, gas_id)
);

-- ============================================================================
-- 7. DISCOVERIES TABLE
-- 3NF Rationale: Historical discovery metadata linked to each planet.
-- All attributes (discoverer, discovery_date, discovery_method) depend solely
-- on discovery_id. Cascades when parent planet is deleted.
-- ============================================================================
CREATE TABLE discoveries (
    discovery_id SERIAL PRIMARY KEY,
    planet_id INT NOT NULL UNIQUE REFERENCES planets(planet_id) ON DELETE CASCADE,
    discoverer VARCHAR(150) NOT NULL DEFAULT 'Known since antiquity',
    discovery_year INT CHECK (discovery_year <= EXTRACT(YEAR FROM CURRENT_DATE)),
    discovery_method VARCHAR(100), -- e.g., 'Naked Eye', 'Telescope', 'Transit Photometry'
    notes TEXT
);

-- ============================================================================
-- 8. AUDIT_LOG TABLE
-- 3NF Rationale: Independent append-only audit trail capturing lifecycle events
-- (INSERT, UPDATE, DELETE) across entities for database auditing and viva demonstration.
-- Fully decoupled from entity primary keys to retain historical logs even after drops.
-- ============================================================================
CREATE TABLE audit_log (
    log_id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    action_type VARCHAR(10) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id INT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    performed_by VARCHAR(50) DEFAULT CURRENT_USER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES ON FOREIGN KEYS
-- Requirement: Accelerate JOIN queries and foreign key CASCADE / RESTRICT lookups.
-- ============================================================================

-- Foreign keys on planets
CREATE INDEX idx_planets_star_id ON planets(star_id);
CREATE INDEX idx_planets_type_id ON planets(type_id);

-- Foreign keys on moons
CREATE INDEX idx_moons_planet_id ON moons(planet_id);

-- Foreign keys on planet_atmosphere
CREATE INDEX idx_planet_atmosphere_planet_id ON planet_atmosphere(planet_id);
CREATE INDEX idx_planet_atmosphere_gas_id ON planet_atmosphere(gas_id);

-- Foreign keys on discoveries
CREATE INDEX idx_discoveries_planet_id ON discoveries(planet_id);

-- Quick lookup for audit log activity by table and time
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
