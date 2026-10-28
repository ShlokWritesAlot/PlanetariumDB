# Software Requirements Specification (SRS)
## Project Name: Planetarium DB
**Document Version:** 1.0  
**Domain:** Relational Database Management Systems (RDBMS) Course Project  
**Author:** Shlok (`ShlokWritesAlot`)  
**Repository:** [https://github.com/ShlokWritesAlot/PlanetariumDB](https://github.com/ShlokWritesAlot/PlanetariumDB)  

---

## 1. Introduction

### 1.1 Purpose
The purpose of this document is to specify the complete functional, non-functional, and architectural requirements for **Planetarium DB**. This web application demonstrates the principle of a **Relational Database Management System (PostgreSQL) as the Single Source of Truth**, where physical and orbital data stored in a 3NF relational schema drives real-time 3D planetary rendering (Three.js) in the browser with zero-polling synchronization via PostgreSQL `LISTEN` / `NOTIFY` and Server-Sent Events (SSE).

### 1.2 Project Scope
Planetarium DB is designed for academic demonstration and viva defense in an undergraduate RDBMS curriculum. It encompasses:
- A third normal form (3NF) relational database with entity integrity, referential integrity, domain constraints, junction tables, and foreign key indexes.
- Advanced database features: materialized presentation views, transactional stored procedures, trigger-driven audit logging, and pub/sub notification broadcasts.
- A Node.js + Express backend communicating with PostgreSQL exclusively via parameterized queries and mapping native SQL errors (`23505`, `23514`, `23503`) to descriptive client responses.
- An interactive WebGL/Three.js frontend applying compressed and logarithmic astronomical scaling functions to render star systems, orbits, axial rotations, and natural satellites dynamically.
- A live administrative side panel featuring CRUD operations, cascade deletions, analytical queries, an audit stream, and a read-only live SQL execution sandbox.

### 1.3 Definitions, Acronyms, and Abbreviations
- **RDBMS:** Relational Database Management System.
- **3NF:** Third Normal Form (a relation is in 3NF if it is in 2NF and has no transitive functional dependencies).
- **FK / PK:** Foreign Key / Primary Key.
- **CASCADE:** A referential action where deleting a parent row automatically deletes all corresponding child rows.
- **SSE:** Server-Sent Events (unidirectional real-time HTTP server-to-client streaming).
- **IPC / Pub-Sub:** Inter-Process Communication / Publish-Subscribe messaging pattern.
- **AU:** Astronomical Unit ($1\text{ AU} \approx 149,597,870.7\text{ km}$).
- **WebGL:** Web Graphics Library for GPU-accelerated 3D rendering.

---

## 2. Overall Description

### 2.1 Product Perspective
Planetarium DB operates as a 3-tier client-server-database architecture:
```
+-------------------------------------------------------------+
|                     PRESENTATION TIER                       |
|  - Three.js WebGL Canvas (Planets, Rings, Moons, Starfield) |
|  - DOM Overlay: Planet Inspector Card                       |
|  - Operations Side Panel (CRUD, Analytics, Audit, Console)  |
+-------------------------------------------------------------+
                              ▲  │ (HTTP REST / JSON)
   (SSE: text/event-stream)   │  ▼
+-------------------------------------------------------------+
|                      APPLICATION TIER                       |
|  - Node.js & Express.js REST API                            |
|  - Connection Pool (`pg.Pool`) & Dedicated `pg.Client`      |
|  - SQL Constraint Violation Exception Mapper                |
|  - Read-Only SQL Sandbox Validator                          |
+-------------------------------------------------------------+
                              ▲  │ (Parameterized SQL: $1, $2)
     (IPC: LISTEN / NOTIFY)   │  ▼
+-------------------------------------------------------------+
|                        DATA TIER                            |
|  - PostgreSQL Server 16/18 Engine                           |
|  - 3NF Schema (stars, planets, moons, gases, discoveries)   |
|  - View: planet_render_view                                 |
|  - Function: add_planet_with_moons()                        |
|  - Triggers: fn_audit_planets(), fn_notify_moons()          |
|  - Table: audit_log (JSONB change history)                  |
+-------------------------------------------------------------+
```

### 2.2 Product Functions
1. **Cataloging:** Maintain precise records of stars, planetary classifications, planets, natural satellites (moons), atmospheric chemical compounds, and historical discoveries.
2. **Dynamic 3D Synthesis:** Translate relational records into orbiting geometric meshes without hardcoding orbital coordinates on the client.
3. **Integrity Enforcement:** Guard against invalid physical states (negative orbital radii, non-positive periods, duplicate names) at the database layer.
4. **Cascading Lifecycles:** When a planet record is dropped from the database, all linked satellites, atmospheric links, and discovery notes are atomically purged via `ON DELETE CASCADE`, reflected immediately in 3D space with ease-out shrink animations.
5. **Real-time Event Streaming:** Eliminate client-side polling by having PostgreSQL triggers broadcast transactions across an asynchronous channel.
6. **Auditing & Live Analysis:** Retain forensic audit snapshots of database modifications and compute aggregate celestial statistics.

### 2.3 User Classes and Characteristics
- **Students / Examiners (Primary User):** Evaluates database normalization, constraint handling, stored procedures, triggers, and query performance during academic defense.
- **Astronomy Enthusiast / Operator:** Interacts with the visual model, creates custom celestial bodies, inspects atmospheric compositions, and tests queries in the SQL console.

### 2.4 Design and Implementation Constraints
- **Database Engine:** PostgreSQL (utilizing PL/pgSQL, JSONB, and native pub/sub IPC).
- **Backend Runtime:** Node.js (v18+), Express.js, `pg` (node-postgres).
- **Client Technologies:** HTML5, Vanilla JavaScript (ES6+), CSS3 (Glassmorphism), Three.js (r128), OrbitControls.
- **Security:** Plaintext SQL queries entered via the client console must be restricted strictly to `SELECT` / `WITH` statements and wrapped inside a read-only transaction.

---

## 3. Specific System Requirements

### 3.1 Data Tier & RDBMS Schema Requirements

#### 3.1.1 Normalization (3NF)
Every relation must satisfy 1NF (atomic attributes), 2NF (no partial key dependencies), and 3NF (every non-key attribute depends strictly on the primary key, and nothing but the primary key):
- **`stars`**: Stores central stellar data (`star_id` PK, `name` UNIQUE, `spectral_type`, `mass_solar_masses`, `radius_solar_radii`, `temperature_kelvin`).
- **`planet_types`**: Reference table isolating planetary classifications (`type_id` PK, `type_name` UNIQUE, `description`) to eliminate transitive redundancy.
- **`planets`**: Central entity (`planet_id` PK, `star_id` FK, `type_id` FK, `name` UNIQUE, `radius_km`, `orbit_radius_au`, `orbital_period_days`, `rotation_period_hours`, `mass_earth_masses`, `has_rings`, `color_hex`, `texture_url`).
- **`moons`**: Dependent natural satellites (`moon_id` PK, `planet_id` FK with `ON DELETE CASCADE`, `name`, `radius_km`, `orbit_radius_km`, `orbital_period_days`, `color_hex`, UNIQUE constraint on `(planet_id, name)`).
- **`gases`**: Chemical master catalog (`gas_id` PK, `name` UNIQUE, `chemical_formula` UNIQUE, `molecular_weight`).
- **`planet_atmosphere`**: Junction table resolving the many-to-many relationship between `planets` and `gases` (`planet_id` FK CASCADE, `gas_id` FK RESTRICT, `percentage` CHECK $0 \le \text{val} \le 100$). Composite PK: `(planet_id, gas_id)`.
- **`discoveries`**: Historical metadata (`discovery_id` PK, `planet_id` FK CASCADE UNIQUE, `discoverer`, `discovery_year`, `discovery_method`, `notes`).
- **`audit_log`**: Append-only log (`log_id` PK, `table_name`, `action_type`, `record_id`, `old_data` JSONB, `new_data` JSONB, `performed_by`, `timestamp`).

#### 3.1.2 Integrity & Domain Constraints
- `radius_km > 0`, `orbit_radius_au > 0`, `orbital_period_days > 0`.
- `percentage BETWEEN 0.00 AND 100.00`.
- `action_type IN ('INSERT', 'UPDATE', 'DELETE')`.
- Referential integrity must use `ON DELETE CASCADE` for child tables (`moons`, `planet_atmosphere`, `discoveries`) and `ON DELETE RESTRICT` for lookup tables (`stars`, `planet_types`, `gases`).

#### 3.1.3 Foreign Key Indexing
Explicit B-Tree indexes must exist for all foreign key columns (`idx_planets_star_id`, `idx_planets_type_id`, `idx_moons_planet_id`, `idx_planet_atmosphere_planet_id`, `idx_discoveries_planet_id`) to accelerate `JOIN` queries and cascade cascades.

#### 3.1.4 Database Objects
1. **`planet_render_view`**: Aggregates `planets`, `stars`, `planet_types`, `moons` (via `COUNT` and `json_agg`), `planet_atmosphere`, and `discoveries` into a single queryable presentation model.
2. **Trigger `trg_audit_planets` & `trg_notify_moons`**:
   - Executes after `INSERT`, `UPDATE`, or `DELETE`.
   - Inserts old and new JSON snapshots into `audit_log`.
   - Calls `pg_notify('planetarium_channel', payload::text)` to publish real-time notifications.
3. **Stored Procedure `add_planet_with_moons()`**:
   - Accepts planet parameters and a JSONB array of moon records.
   - Executes inside an atomic PL/pgSQL transaction block. Rolls back completely if any child record violates a constraint.

---

### 3.2 Backend & API Requirements

#### 3.2.1 REST API Specification
- `GET /api/planets`: Returns all planets from `planet_render_view` sorted by `orbit_radius_au ASC`.
- `POST /api/planets`: Parameterized insert into `planets`. Returns HTTP 201 on success.
- `POST /api/planets/with-moons`: Transactional insert utilizing `add_planet_with_moons()`.
- `PUT /api/planets/:id`: Updates an existing planet's attributes.
- `DELETE /api/planets/:id`: Deletes a planet by ID, triggering cascading cleanup in child tables.
- `GET /api/stats`: Executes five analytical queries concurrently and returns aggregated statistics.
- `GET /api/audit`: Returns the most recent 50 entries from `audit_log`.
- `GET /api/events`: Establishes a persistent Server-Sent Events (SSE) connection streaming PostgreSQL trigger events.
- `POST /api/query`: Receives an arbitrary SQL string, verifies that it is strictly a read-only `SELECT` query, executes it inside a `BEGIN READ ONLY;` transaction block, and returns rows, field names, and execution latency in milliseconds.

#### 3.2.2 Security & Error Handling
- All internal queries must use parameterized placeholders (`$1, $2, ...`) to eliminate SQL injection vulnerabilities.
- PostgreSQL error codes must be caught and mapped to human-readable JSON responses:
  - `23505` &rarr; `409 Conflict: Unique constraint violated`
  - `23514` &rarr; `400 Bad Request: Check constraint violated`
  - `23503` &rarr; `400 Bad Request: Foreign key violation`
  - `23502` &rarr; `400 Bad Request: Not null violation`
- The SQL console must reject any query containing non-SELECT tokens (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `EXECUTE`) with HTTP 403 Forbidden.

---

### 3.3 Frontend & 3D Visualization Requirements

#### 3.3.1 Mathematical Astronomical Scaling
Due to the vast disparity in real astronomical sizes (Jupiter's radius is $28\times$ Mercury; Neptune's distance is $78\times$ Mercury's), the client engine must apply logarithmic and power-law scaling functions:
1. **Radius Scaling:**
   $$\text{ScaleRadius}(r) = \max\left(1.0, (\log_{10}(r) - 2.8) \times 1.8 + 1.2\right)$$
   Guarantees small terrestrial planets are rendered clearly while maintaining visible distinction for gas giants.
2. **Orbital Distance Scaling:**
   $$\text{ScaleOrbit}(d) = d^{0.65} \times 30.0 + 24.0$$
   Compresses outer orbits into the camera's default viewport without obscuring inner terrestrial bodies.
3. **Orbital Speed (Keplerian Approximation):**
   $$\text{Speed}(P) = \frac{1}{\sqrt{P}} \times 0.015$$
   Reflects Kepler's Third Law (inner planets orbit faster than outer planets).

#### 3.3.2 3D Scene Components
- Central star mesh with an inner emissive core, point-light source, and a translucent corona glow mesh.
- Orbit ring line geometries for each registered planet.
- Moons revolving in local parent space around their respective planets with subtle inclination offsets.
- Starfield particle background with 3,500 points distributed across random spherical coordinates.
- Mouse raycasting: Clicking or hovering over any planet mesh opens an inspector card displaying type, star system, radius, orbital metrics, atmospheric percentage breakdown, and historical discovery notes.
- Smooth scale-in ($0 \to 1$) and scale-out ($1 \to 0$) cubic easing animations when planets are added or deleted via database triggers without requiring a full browser refresh.

#### 3.3.3 Operations Side Panel Requirements
A collapsible glassmorphic side drawer containing five tabs:
1. **Add Planet Tab:** Complete planet creation form + dynamic moons subform (`➕ Add Moon`), with inline error alerts for constraint violations.
2. **Planets & Delete Tab:** Catalog list displaying each planet's color dot, AU distance, moon count, and an inline delete button triggering cascade deletion.
3. **Stats Tab:** Visualizes the 5 SQL analytical queries in formatted mini-tables.
4. **Live Audit Tab:** Chronological stream of colored audit badges (`INSERT`, `UPDATE`, `DELETE`) updated dynamically from incoming SSE messages.
5. **SQL Console Tab:** Interactive code editor with query presets, table viewer, and latency indicators.

---

## 4. Analytical SQL Queries for Viva Defense

The system embeds five analytical SQL queries illustrating key RDBMS aggregation, filtering, and subquery concepts:

1. **Query 1: Heaviest Planet (Subquery + Multiple JOINs)**
   ```sql
   SELECT p.planet_id, p.name AS planet_name, p.mass_earth_masses, pt.type_name, s.name AS star_name
   FROM planets p
   JOIN planet_types pt ON p.type_id = pt.type_id
   JOIN stars s ON p.star_id = s.star_id
   WHERE p.mass_earth_masses = (SELECT MAX(mass_earth_masses) FROM planets);
   ```
   *Explanation:* Uses an uncorrelated subquery in the `WHERE` clause to identify the global maximum mass, joined with dimension tables for spectral and classification context.

2. **Query 2: Total Planets per Star System (GROUP BY + LEFT JOIN)**
   ```sql
   SELECT s.star_id, s.name AS star_name, s.spectral_type, COUNT(p.planet_id) AS total_planets
   FROM stars s
   LEFT JOIN planets p ON s.star_id = p.star_id
   GROUP BY s.star_id, s.name, s.spectral_type
   ORDER BY total_planets DESC;
   ```
   *Explanation:* Demonstrates `LEFT JOIN` semantics: stars with zero planets are retained in the result set with a count of 0.

3. **Query 3: Orbit Distance Metrics per Planet Type (GROUP BY + Multi-Aggregates)**
   ```sql
   SELECT pt.type_name, COUNT(p.planet_id) AS total_planets,
          ROUND(AVG(p.orbit_radius_au), 2) AS avg_orbit_radius_au,
          ROUND(MIN(p.orbit_radius_au), 2) AS min_orbit_radius_au,
          ROUND(MAX(p.orbit_radius_au), 2) AS max_orbit_radius_au
   FROM planet_types pt
   JOIN planets p ON pt.type_id = p.type_id
   GROUP BY pt.type_id, pt.type_name
   ORDER BY avg_orbit_radius_au ASC;
   ```
   *Explanation:* Aggregates orbital distribution metrics across planetary classifications.

4. **Query 4: Planets with Most Satellites (GROUP BY + HAVING Clause)**
   ```sql
   SELECT p.planet_id, p.name AS planet_name, pt.type_name, COUNT(m.moon_id) AS moon_count
   FROM planets p
   JOIN planet_types pt ON p.type_id = pt.type_id
   JOIN moons m ON p.planet_id = m.planet_id
   GROUP BY p.planet_id, p.name, pt.type_name
   HAVING COUNT(m.moon_id) >= 2
   ORDER BY moon_count DESC;
   ```
   *Explanation:* Demonstrates post-aggregation filtering using `HAVING` to isolate systems with 2 or more natural satellites.

5. **Query 5: Planets Without Atmospheric Data (Correlated NOT EXISTS Subquery)**
   ```sql
   SELECT p.planet_id, p.name AS planet_name, pt.type_name, p.radius_km
   FROM planets p
   JOIN planet_types pt ON p.type_id = pt.type_id
   WHERE NOT EXISTS (
       SELECT 1 FROM planet_atmosphere pa WHERE pa.planet_id = p.planet_id
   );
   ```
   *Explanation:* Illustrates set-difference logic using a correlated `NOT EXISTS` subquery against the many-to-many junction table.

---

## 5. Non-Functional Requirements

### 5.1 Performance
- API response time for `/api/planets` (including moon and atmosphere JSON aggregation) shall not exceed 100ms under standard local load.
- Real-time notification latency from the moment a transaction commits in PostgreSQL to the client receiving the SSE frame shall be less than 50ms.
- 3D WebGL rendering loop shall sustain 60 frames per second on modern hardware with up to 100 simultaneous celestial bodies.

### 5.2 Reliability & Transactional Integrity
- All multi-table operations (e.g., adding a planet alongside its satellite collection) shall follow ACID properties via database transactions or stored procedures. Partial writes are strictly forbidden.
- In the event of a client disconnect or server restart, the database remains in a consistent state without orphaned records.

### 5.3 Usability & Aesthetics
- UI shall feature a dark space theme (`#070913`) with glassmorphism overlays (`backdrop-filter: blur(16px)`), modern typography (`Inter`, `JetBrains Mono`), and clear color-coded indicators.
- Camera controls shall support smooth orbiting, zooming, and panning with responsive touch and mouse inputs.

---

## 6. Verification and Testing Matrix

| Test ID | Requirement | Test Case | Expected Result |
|---|---|---|---|
| **TC-01** | Unique Constraint | Attempt to insert planet with name `'Earth'` | HTTP 409 returned; inline error banner displays `"Conflict: Unique constraint violated"`. |
| **TC-02** | Check Constraint | Insert planet with `radius_km = -500` | HTTP 400 returned; inline error displays `"Validation Error: Check constraint violated"`. |
| **TC-03** | Cascade Delete | Delete planet with ID 5 (Jupiter) | Jupiter and all 4 Galilean moons are deleted from DB and shrink out of 3D scene. |
| **TC-04** | Atomic Stored Proc | Call `/api/planets/with-moons` with 1 valid moon and 1 moon with radius `-10` | Procedure rolls back; neither planet nor moons are persisted in database. |
| **TC-05** | Real-time SSE | Execute `INSERT` directly in `psql` console | Backend receives `NOTIFY`; pushes SSE; frontend spawns new 3D planet without page refresh. |
| **TC-06** | SQL Console Security | Execute `DROP TABLE planets;` in SQL console | Request rejected with HTTP 403 Forbidden; database schema remains intact. |
