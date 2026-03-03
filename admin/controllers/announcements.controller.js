const Announcements = require('../../models/announcements.model');

const AnnouncementsController = {
    async list(req, res) {
        const list = await Announcements.getAll(req.query);
        console.log('[AnnouncementsController:list] count:', list.length);
        res.json(list);
    },

    async detail(req, res) {
        const item = await Announcements.getById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Announcement not found' });
        res.json(item);
    },

    async create(req, res) {
        const { content, active, priority } = req.body;
        if (!content?.trim()) {
            return res.status(400).json({ message: 'Content is required' });
        }
        const item = await Announcements.create({ content, active, priority });
        res.status(201).json(item);
    },

    async update(req, res) {
        const item = await Announcements.update(req.params.id, req.body);
        if (!item) return res.status(404).json({ message: 'Announcement not found' });
        res.json(item);
    },

    async delete(req, res) {
        await Announcements.delete(req.params.id);
        res.json({ message: 'Announcement deleted' });
    }
};

module.exports = AnnouncementsController;
