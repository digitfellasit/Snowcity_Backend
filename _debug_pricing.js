require('dotenv').config();
const bookingService = require('./services/bookingService');
const { pool } = require('./config/db');

async function debug() {
  try {
    console.log('\n--- Inspecting Latest Combo Booking and its children ---');
    const { rows: latestParent } = await pool.query(
      'SELECT booking_id, total_amount, discount_amount, final_amount, offer_id, combo_id, created_at FROM bookings WHERE item_type = \'Combo\' ORDER BY booking_id DESC LIMIT 1'
    );

    if (latestParent.length === 0) {
      console.log('No combo bookings found.');
      process.exit(0);
    }

    const parent = latestParent[0];
    console.log('Parent Booking:', JSON.stringify(parent, null, 2));

    const { rows: children } = await pool.query(
      'SELECT booking_id, parent_booking_id, attraction_id, total_amount, quantity FROM bookings WHERE parent_booking_id = $1',
      [parent.booking_id]
    );
    console.log('Child Bookings:', JSON.stringify(children, null, 2));

    if (parent.offer_id) {
      const { rows: ruleInfo } = await pool.query(
        'SELECT rule_id, name, child_price_adjustments FROM dynamic_pricing_rules WHERE rule_id = $1',
        [parent.offer_id]
      );
      console.log('\n--- Rule associated with booking ---');
      console.log(JSON.stringify(ruleInfo, null, 2));
    } else {
      console.log('\nNo offer_id associated with this booking.');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
