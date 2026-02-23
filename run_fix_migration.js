require('dotenv').config();
const { runSqlFile } = require('./config/db');
const path = require('path');

async function run() {
    const file = process.argv[2];
    if (!file) {
        console.error('Please provide a migration file path');
        process.exit(1);
    }
    try {
        console.log(`Running migration: ${file}`);
        await runSqlFile(file);
        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
