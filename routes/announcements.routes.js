const express = require('express');
const router = express.Router();
const Announcements = require('../models/announcements.model');

// Public route for the home page marquee
router.get('/active', async (req, res) => {
    try {
        const list = await Announcements.getAll({ active: true });
        console.log('[PublicAnnouncements:active] count:', list.length);
        res.json(list);
    } catch (err) {
        console.error('[PublicAnnouncements:active] error:', err);
        res.status(500).json({ message: 'Failed to fetch announcements' });
    }
});

module.exports = router;
