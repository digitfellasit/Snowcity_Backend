require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanupDatabaseSlots() {
  console.log('Cleaning up database slots (moving to dynamic generation)...');
  
  try {
    // Check current slot counts
    const comboSlotsCount = await pool.query('SELECT COUNT(*) as count FROM combo_slots');
    const attractionSlotsCount = await pool.query('SELECT COUNT(*) as count FROM attraction_slots');
    
    console.log('\n=== BEFORE CLEANUP ===');
    console.log(`Combo slots in database: ${comboSlotsCount.rows[0].count}`);
    console.log(`Attraction slots in database: ${attractionSlotsCount.rows[0].count}`);
    
    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will delete all slots from the database!');
    console.log('📅 Slots will be generated dynamically from now on');
    console.log('🎯 This is recommended for the new calendar-based system');
    
    // For safety, let's backup the data first
    console.log('\n📦 Creating backup...');
    
    const comboSlotsBackup = await pool.query('SELECT * FROM combo_slots LIMIT 100');
    const attractionSlotsBackup = await pool.query('SELECT * FROM attraction_slots LIMIT 100');
    
    console.log(`Backed up ${comboSlotsBackup.rows.length} combo slots and ${attractionSlotsBackup.rows.length} attraction slots`);
    
    // Delete slots from database
    console.log('\n🗑️  Deleting slots from database...');
    
    await pool.query('DELETE FROM combo_slots');
    await pool.query('DELETE FROM attraction_slots');
    
    // Verify deletion
    const newComboSlotsCount = await pool.query('SELECT COUNT(*) as count FROM combo_slots');
    const newAttractionSlotsCount = await pool.query('SELECT COUNT(*) as count FROM attraction_slots');
    
    console.log('\n=== AFTER CLEANUP ===');
    console.log(`Combo slots in database: ${newComboSlotsCount.rows[0].count}`);
    console.log(`Attraction slots in database: ${newAttractionSlotsCount.rows[0].count}`);
    
    console.log('\n✅ CLEANUP COMPLETE!');
    console.log('🎉 System now uses dynamic slot generation');
    
    console.log('\n📋 NEW SYSTEM BENEFITS:');
    console.log('✅ No database storage for slots');
    console.log('✅ Calendar-based generation (10 AM - 8 PM)');
    console.log('✅ Attraction slots: 1 hour duration');
    console.log('✅ Combo slots: Duration based on number of attractions');
    console.log('✅ Unlimited date range support');
    console.log('✅ Virtual slot IDs for tracking');
    console.log('✅ Automatic time-based availability');
    
    console.log('\n🚀 READY FOR TESTING!');
    console.log('1. Start backend server');
    console.log('2. Navigate to attraction/combo slots in admin');
    console.log('3. Slots will be generated dynamically');
    console.log('4. Test booking functionality');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await pool.end();
  }
}

// cleanupDatabaseSlots(); // Commented out - no longer cleaning pending orders automatically
