const express = require('express');
const router = express.Router();
const consolidatedNamingsController = require('../controllers/consolidatedNamings.controller');

router.get('/', consolidatedNamingsController.listConsolidatedNamings);
router.post('/', consolidatedNamingsController.createConsolidatedNaming);
router.put('/:id', consolidatedNamingsController.updateConsolidatedNaming);
router.delete('/:id', consolidatedNamingsController.deleteConsolidatedNaming);

module.exports = router;
