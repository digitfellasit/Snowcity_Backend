require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

(async () => {
    const hash = await bcrypt.hash('Snowcity@123', 10);

    // Upsert user
    const ins = await pool.query(
        `INSERT INTO users (name, email, password_hash)
     VALUES ('Super Admin', 'admin@snowcity.local', $1)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1
     RETURNING user_id`,
        [hash]
    );
    const uid = ins.rows[0].user_id;
    console.log('User ID:', uid);

    // Assign superadmin + root roles
    await pool.query(
        `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, role_id FROM roles WHERE role_name IN ('superadmin', 'root')
     ON CONFLICT DO NOTHING`,
        [uid]
    );

    // Grant full access to all resource types
    const types = ['attraction', 'combo', 'banner', 'page', 'blog', 'gallery'];
    for (const t of types) {
        await pool.query(
            `INSERT INTO admin_access (user_id, resource_type, resource_id)
       VALUES ($1, $2, -1)
       ON CONFLICT DO NOTHING`,
            [uid, t]
        );
    }

    console.log('Done! superadmin + root assigned with full access to user_id=' + uid);
    await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
