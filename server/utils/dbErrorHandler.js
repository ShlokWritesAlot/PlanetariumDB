/**
 * Maps PostgreSQL error codes to clear, friendly user-facing messages.
 * Critical for RDBMS coursework and viva demonstrations to show constraint enforcement.
 *
 * Postgres error codes:
 * - 23505: unique_violation
 * - 23514: check_violation
 * - 23503: foreign_key_violation
 * - 23502: not_null_violation
 * - 22P02: invalid_text_representation (data type mismatch)
 * - P0001: raise_exception (custom PL/pgSQL exceptions)
 */
function handleDatabaseError(err, res) {
    console.error('Database Error:', err.message, err.code, err.detail);

    switch (err.code) {
        case '23505': // UNIQUE VIOLATION
            return res.status(409).json({
                success: false,
                error: 'Conflict: Unique constraint violated.',
                detail: err.detail || 'A record with this unique value (e.g., planet name) already exists.',
                constraint: err.constraint
            });

        case '23514': // CHECK VIOLATION
            return res.status(400).json({
                success: false,
                error: 'Validation Error: Check constraint violated.',
                detail: `The provided value violated rule '${err.constraint}' (e.g., radius_km > 0, orbit_radius_au > 0, orbital_period_days > 0).`,
                constraint: err.constraint
            });

        case '23503': // FOREIGN KEY VIOLATION
            return res.status(400).json({
                success: false,
                error: 'Foreign Key Violation: Referenced entity does not exist or cannot be modified.',
                detail: err.detail || 'Foreign key constraint violated.',
                constraint: err.constraint
            });

        case '23502': // NOT NULL VIOLATION
            return res.status(400).json({
                success: false,
                error: 'Missing Required Field.',
                detail: `Column '${err.column}' cannot be null.`,
                column: err.column
            });

        case '22P02': // INVALID INPUT SYNTAX
            return res.status(400).json({
                success: false,
                error: 'Invalid input format or type mismatch.',
                detail: err.message
            });

        case 'P0001': // PL/pgSQL RAISE EXCEPTION
            return res.status(400).json({
                success: false,
                error: 'Procedure Execution Failed.',
                detail: err.message
            });

        default:
            return res.status(500).json({
                success: false,
                error: 'Internal Database Error',
                detail: err.message || 'An unexpected database error occurred.'
            });
    }
}

module.exports = { handleDatabaseError };
