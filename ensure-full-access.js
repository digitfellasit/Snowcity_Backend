const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { initializeSystem } = require('./services/initService');
const { pool } = require('./config/db');

async function run() {
    try {
        console.log('🚀 Starting full access permission update...');
        await initializeSystem();
        console.log('✅ Permissions updated successfully.');
    } catch (error) {
        console.error('❌ Error updating permissions:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

run();
