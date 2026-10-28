# Planetarium DB 🪐

An RDBMS course project demonstrating **PostgreSQL as the single source of truth** for a live 3D solar system web application. Inserting a planet creates a new orbiting mesh in real time; deleting it cascades to all its moons.

---

## Tech Stack
- **Database:** PostgreSQL (3NF Schema, Views, Triggers, Stored Procedures, Cascading Constraints, Indexes)
- **Backend:** Node.js, Express.js, `pg` (node-postgres)
- **Frontend:** Vanilla JavaScript, Three.js, OrbitControls, Glassmorphism UI

---

## Database Setup

1. Start your local PostgreSQL server.
2. Create a new database:
   ```sql
   CREATE DATABASE planetarium_db;
   ```
3. Run the SQL files in order:
   ```bash
   psql -U postgres -d planetarium_db -f database/schema.sql
   psql -U postgres -d planetarium_db -f database/seed.sql
   psql -U postgres -d planetarium_db -f database/advanced.sql
   ```

---

## Backend Setup & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env` and fill in your PostgreSQL credentials:
   ```env
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=planetarium_db
   PGUSER=postgres
   PGPASSWORD=your_postgres_password
   PORT=3000
   ```

3. **Start the server:**
   ```bash
   # Development mode with auto-reload:
   npm run dev

   # Or standard production mode:
   npm start
   ```

4. **Open in browser:**
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## API Documentation

All endpoints strictly use parameterized queries (`$1, $2, ...`) to prevent SQL injection and map PostgreSQL constraint violations (`23505`, `23514`, `23503`) to friendly JSON responses.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/planets` | Fetch all planets with aggregated moons from `planet_render_view` |
| `POST` | `/api/planets` | Insert a single planet with physical properties & color |
| `POST` | `/api/planets/with-moons` | Insert a planet and its moons in a single atomic transaction |
| `PUT` | `/api/planets/:id` | Update physical/orbital parameters of a planet |
| `DELETE` | `/api/planets/:id` | Delete a planet (cascades to moons, atmosphere, discoveries) |
| `GET` | `/api/stats` | Run the 5 analytical queries (heaviest planet, planets per star, etc.) |
| `GET` | `/api/audit` | Fetch recent rows from `audit_log` written by the trigger |

---

## Viva Talking Points

1. **Single Source of Truth:**
   The frontend does not hardcode orbits or planet lists. Every render parameter (orbit distance, radius, color, period) originates from the PostgreSQL table or view.
2. **Cascading Referential Integrity:**
   Deleting a planet automatically removes all associated moons and atmospheric records via `ON DELETE CASCADE`.
3. **Audit Trail via Triggers:**
   The `fn_audit_planets()` trigger captures all `INSERT`, `UPDATE`, and `DELETE` operations on `planets` into `audit_log` with `JSONB` diffs.
4. **Transaction Atomicity:**
   `add_planet_with_moons()` ensures that if a moon violates a check constraint (e.g. negative radius), the entire planet insertion is rolled back.
