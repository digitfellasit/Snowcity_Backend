const { query } = require('../config/db');

const Announcements = {
    async getAll(params = {}) {
        const { active, limit = 100, offset = 0 } = params;
        let sql = 'SELECT * FROM announcements';
        const values = [];

        if (active !== undefined) {
            sql += ' WHERE active = $1';
            values.push(active === 'true' || active === true);
        }

        sql += ' ORDER BY priority DESC, created_at DESC';

        if (limit) {
            sql += ` LIMIT $${values.length + 1}`;
            values.push(limit);
        }
        if (offset) {
            sql += ` OFFSET $${values.length + 1}`;
            values.push(offset);
        }

        const { rows } = await query(sql, values);
        return rows;
    },

    async getById(id) {
        const { rows } = await query('SELECT * FROM announcements WHERE id = $1', [id]);
        return rows[0];
    },

    async create(data) {
        const { content, active = true, priority = 0 } = data;
        const { rows } = await query(
            'INSERT INTO announcements (content, active, priority) VALUES ($1, $2, $3) RETURNING *',
            [content, active, priority]
        );
        return rows[0];
    },

    async update(id, data) {
        const fields = [];
        const values = [];
        let idx = 1;

        if (data.content !== undefined) {
            fields.push(`content = $${idx++}`);
            values.push(data.content);
        }
        if (data.active !== undefined) {
            fields.push(`active = $${idx++}`);
            values.push(data.active);
        }
        if (data.priority !== undefined) {
            fields.push(`priority = $${idx++}`);
            values.push(data.priority);
        }

        if (fields.length === 0) return this.getById(id);

        values.push(id);
        const sql = `UPDATE announcements SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const { rows } = await query(sql, values);
        return rows[0];
    },

    async delete(id) {
        await query('DELETE FROM announcements WHERE id = $1', [id]);
        return true;
    }
};

module.exports = Announcements;
