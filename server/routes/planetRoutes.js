const express = require('express');
const router = express.Router();
const planetController = require('../controllers/planetController');

// GET /api/planets - Fetch all planets with aggregated moons from planet_render_view
router.get('/', planetController.getAllPlanets);

// POST /api/planets - Add a single planet
router.post('/', planetController.createPlanet);

// POST /api/planets/with-moons - Transactional insert of a planet and its moons
router.post('/with-moons', planetController.createPlanetWithMoons);

// PUT /api/planets/:id - Update an existing planet
router.put('/:id', planetController.updatePlanet);

// DELETE /api/planets/:id - Delete a planet (cascades to moons, atmosphere, etc.)
router.delete('/:id', planetController.deletePlanet);

module.exports = router;
