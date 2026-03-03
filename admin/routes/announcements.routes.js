const express = require('express');
const router = express.Router();
const AnnouncementsController = require('../controllers/announcements.controller');

// Admin CRUD for announcements
router.get('/', AnnouncementsController.list);
router.get('/:id', AnnouncementsController.detail);
router.post('/', AnnouncementsController.create);
router.put('/:id', AnnouncementsController.update);
router.delete('/:id', AnnouncementsController.delete);

module.exports = router;
