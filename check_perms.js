require('dotenv').config();
const { pool } = require('./config/db');
(async () => {
    // List all admin users with roles
    const { rows } = await pool.query(
        `SELECT u.user_id, u.name, u.email, ARRAY_AGG(r.role_name) AS roles
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.user_id
     JOIN roles r ON r.role_id = ur.role_id
     GROUP BY u.user_id
     ORDER BY u.user_id`
    );
    for (const r of rows) {
        console.log(`  user_id=${r.user_id}  ${r.email}  roles=[${r.roles.join(',')}]`);
    }

    // Check editor user specifically
    const { rows: editorUsers } = await pool.query(
        `SELECT u.user_id, u.name, u.email, ARRAY_AGG(r.role_name) as roles
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.user_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE r.role_name = 'editor'
     GROUP BY u.user_id`
    );
    console.log('\nEditor users:', editorUsers.length ? editorUsers : 'NONE FOUND');

    // Check permissions for those editor users
    for (const eu of editorUsers) {
        const { rows: perms } = await pool.query(
            `SELECT LOWER(p.permission_key) AS pk
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
       WHERE ur.user_id = $1`, [eu.user_id]
        );
        console.log(`  Perms for user ${eu.user_id}: ${perms.map(p => p.pk).join(', ')}`);
    }

    await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
