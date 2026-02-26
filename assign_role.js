const { pool } = require('./config/db');

async function assignRole(userId, roleName) {
  try {
    const roleRes = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', [roleName]);
    if (!roleRes.rows[0]) throw new Error('Role not found');
    const roleId = roleRes.rows[0].role_id;

    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, roleId]);
    await pool.query('UPDATE users SET role_id = $1 WHERE user_id = $2', [roleId, userId]);

    console.log(`Assigned ${roleName} to user ${userId}`);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

assignRole(process.argv[2] || 1, 'super_admin');
