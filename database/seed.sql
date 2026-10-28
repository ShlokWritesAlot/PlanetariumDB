-- ============================================================================
-- PLANETARIUM DB - Realistic Seed Data
-- DBMS: PostgreSQL
-- Inserts data respecting Foreign Key dependency order:
-- 1. stars, planet_types, gases (Independent lookup/parent tables)
-- 2. planets (References stars, planet_types)
-- 3. moons, planet_atmosphere, discoveries (Reference planets and gases)
-- ============================================================================

-- Clean up existing data before seeding
TRUNCATE TABLE audit_log, planet_atmosphere, discoveries, moons, planets, gases, planet_types, stars RESTART IDENTITY CASCADE;

-- ============================================================================
-- 1. STARS
-- Central body of the Solar System
-- ============================================================================
INSERT INTO stars (name, spectral_type, mass_solar_masses, radius_solar_radii, temperature_kelvin)
VALUES ('Sun', 'G2V', 1.0000, 1.0000, 5778.00);

-- ============================================================================
-- 2. PLANET TYPES (Lookup)
-- ============================================================================
INSERT INTO planet_types (type_name, description) VALUES
('Terrestrial', 'Rocky planets with solid surfaces, composed mostly of silicate rocks or metals.'),
('Gas Giant', 'Massive planets composed mostly of hydrogen and helium gas surrounding a dense core.'),
('Ice Giant', 'Planets composed mainly of elements heavier than hydrogen and helium, such as water, ammonia, and methane.'),
('Dwarf Planet', 'Celestial bodies orbiting the sun with sufficient mass for self-gravity, but not cleared their neighborhood.');

-- ============================================================================
-- 3. GASES (Lookup)
-- Key atmospheric gases across planets
-- ============================================================================
INSERT INTO gases (name, chemical_formula, molecular_weight) VALUES
('Nitrogen', 'N2', 28.0134),
('Oxygen', 'O2', 31.9988),
('Carbon Dioxide', 'CO2', 44.0100),
('Argon', 'Ar', 39.9480),
('Methane', 'CH4', 16.0400),
('Hydrogen', 'H2', 2.0159),
('Helium', 'He', 4.0026),
('Water Vapor', 'H2O', 18.0153);

-- ============================================================================
-- 4. PLANETS (All 8 Solar System Planets)
-- Approximate real-world physical and orbital values with distinct hex colors for Three.js
-- ============================================================================
INSERT INTO planets (
    star_id, type_id, name, radius_km, orbit_radius_au,
    orbital_period_days, rotation_period_hours, mass_earth_masses,
    has_rings, color_hex
) VALUES
-- Mercury
(1, 1, 'Mercury', 2439.70, 0.3871, 87.97, 1407.60, 0.0553, FALSE, '#A8A8A8'),
-- Venus
(1, 1, 'Venus', 6051.80, 0.7233, 224.70, -5832.50, 0.8150, FALSE, '#E3BB7B'),
-- Earth
(1, 1, 'Earth', 6371.00, 1.0000, 365.26, 23.93, 1.0000, FALSE, '#2E86AB'),
-- Mars
(1, 1, 'Mars', 3389.50, 1.5237, 686.98, 24.62, 0.1070, FALSE, '#C94A29'),
-- Jupiter
(1, 2, 'Jupiter', 69911.00, 5.2044, 4332.59, 9.93, 317.8000, TRUE, '#D4A373'),
-- Saturn
(1, 2, 'Saturn', 58232.00, 9.5826, 10759.22, 10.70, 95.2000, TRUE, '#E0C895'),
-- Uranus
(1, 3, 'Uranus', 25362.00, 19.2184, 30688.50, -17.24, 14.5000, TRUE, '#72C2C8'),
-- Neptune
(1, 3, 'Neptune', 24622.00, 30.0700, 60182.00, 16.11, 17.1000, TRUE, '#3D5AFE');

-- ============================================================================
-- 5. MOONS (10 Notable Moons)
-- ============================================================================
-- Earth Moon
INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Moon', 1737.40, 384400.00, 27.3217, '#DDDDDD' FROM planets WHERE name = 'Earth';

-- Mars Moons
INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Phobos', 11.27, 9376.00, 0.3189, '#8B7D7B' FROM planets WHERE name = 'Mars';

INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Deimos', 6.20, 23463.00, 1.2630, '#9C8F80' FROM planets WHERE name = 'Mars';

-- Jupiter Galilean Moons
INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Io', 1821.60, 421700.00, 1.7691, '#F3E5AB' FROM planets WHERE name = 'Jupiter';

INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Europa', 1560.80, 670900.00, 3.5512, '#C4A482' FROM planets WHERE name = 'Jupiter';

INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Ganymede', 2634.10, 1070400.00, 7.1546, '#938B82' FROM planets WHERE name = 'Jupiter';

INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Callisto', 2410.30, 1882700.00, 16.6890, '#69645E' FROM planets WHERE name = 'Jupiter';

-- Saturn Moons
INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Titan', 2574.73, 1221870.00, 15.9450, '#E4A853' FROM planets WHERE name = 'Saturn';

INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Enceladus', 252.10, 238000.00, 1.3702, '#FFFFFF' FROM planets WHERE name = 'Saturn';

-- Neptune Moon
INSERT INTO moons (planet_id, name, radius_km, orbit_radius_km, orbital_period_days, color_hex)
SELECT planet_id, 'Triton', 1353.40, 354759.00, 5.8769, '#A5B5BF' FROM planets WHERE name = 'Neptune';

-- ============================================================================
-- 6. PLANET ATMOSPHERE (Many-to-Many Relationships)
-- Percentage breakdown for planets that have substantial atmospheres
-- ============================================================================
-- Venus: Dense CO2 + Nitrogen atmosphere
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 96.50
FROM planets p, gases g WHERE p.name = 'Venus' AND g.chemical_formula = 'CO2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 3.50
FROM planets p, gases g WHERE p.name = 'Venus' AND g.chemical_formula = 'N2';

-- Earth: Nitrogen (78.08%), Oxygen (20.95%), Argon (0.93%), Carbon Dioxide (0.04%)
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 78.08
FROM planets p, gases g WHERE p.name = 'Earth' AND g.chemical_formula = 'N2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 20.95
FROM planets p, gases g WHERE p.name = 'Earth' AND g.chemical_formula = 'O2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 0.93
FROM planets p, gases g WHERE p.name = 'Earth' AND g.chemical_formula = 'Ar';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 0.04
FROM planets p, gases g WHERE p.name = 'Earth' AND g.chemical_formula = 'CO2';

-- Mars: CO2 (95.32%), Nitrogen (2.60%), Argon (1.90%)
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 95.32
FROM planets p, gases g WHERE p.name = 'Mars' AND g.chemical_formula = 'CO2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 2.60
FROM planets p, gases g WHERE p.name = 'Mars' AND g.chemical_formula = 'N2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 1.90
FROM planets p, gases g WHERE p.name = 'Mars' AND g.chemical_formula = 'Ar';

-- Jupiter: Hydrogen (89.80%), Helium (10.20%)
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 89.80
FROM planets p, gases g WHERE p.name = 'Jupiter' AND g.chemical_formula = 'H2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 10.20
FROM planets p, gases g WHERE p.name = 'Jupiter' AND g.chemical_formula = 'He';

-- Saturn: Hydrogen (96.30%), Helium (3.25%), Methane (0.45%)
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 96.30
FROM planets p, gases g WHERE p.name = 'Saturn' AND g.chemical_formula = 'H2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 3.25
FROM planets p, gases g WHERE p.name = 'Saturn' AND g.chemical_formula = 'He';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 0.45
FROM planets p, gases g WHERE p.name = 'Saturn' AND g.chemical_formula = 'CH4';

-- Uranus: Hydrogen (82.50%), Helium (15.20%), Methane (2.30%)
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 82.50
FROM planets p, gases g WHERE p.name = 'Uranus' AND g.chemical_formula = 'H2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 15.20
FROM planets p, gases g WHERE p.name = 'Uranus' AND g.chemical_formula = 'He';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 2.30
FROM planets p, gases g WHERE p.name = 'Uranus' AND g.chemical_formula = 'CH4';

-- Neptune: Hydrogen (80.00%), Helium (19.00%), Methane (1.00%)
INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 80.00
FROM planets p, gases g WHERE p.name = 'Neptune' AND g.chemical_formula = 'H2';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 19.00
FROM planets p, gases g WHERE p.name = 'Neptune' AND g.chemical_formula = 'He';

INSERT INTO planet_atmosphere (planet_id, gas_id, percentage)
SELECT p.planet_id, g.gas_id, 1.00
FROM planets p, gases g WHERE p.name = 'Neptune' AND g.chemical_formula = 'CH4';

-- ============================================================================
-- 7. DISCOVERIES
-- Discovery history for all 8 planets
-- ============================================================================
INSERT INTO discoveries (planet_id, discoverer, discovery_year, discovery_method, notes)
SELECT planet_id, 'Known since antiquity', NULL, 'Naked Eye', 'Observed by ancient astronomers across Babylonian, Greek, and Indian civilizations.'
FROM planets WHERE name IN ('Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn');

-- Earth discovery record
INSERT INTO discoveries (planet_id, discoverer, discovery_year, discovery_method, notes)
SELECT planet_id, 'Humanity', NULL, 'Inhabited', 'Home planet of humanity; recognized as an orbiting planet after Copernican heliocentrism.'
FROM planets WHERE name = 'Earth';

-- Uranus
INSERT INTO discoveries (planet_id, discoverer, discovery_year, discovery_method, notes)
SELECT planet_id, 'William Herschel', 1781, 'Reflecting Telescope', 'First planet discovered with the aid of a telescope, expanding the known solar system.'
FROM planets WHERE name = 'Uranus';

-- Neptune
INSERT INTO discoveries (planet_id, discoverer, discovery_year, discovery_method, notes)
SELECT planet_id, 'Urbain Le Verrier & Johann Galle', 1846, 'Mathematical Prediction', 'Predicted mathematically based on unexplained perturbations in Uranus orbital path.'
FROM planets WHERE name = 'Neptune';
