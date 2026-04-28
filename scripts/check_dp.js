require('dotenv').config();
const { pool } = require('../config/db');

(async () => {
  try {
    // 1. Get column names for attractions
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'attractions' ORDER BY ordinal_position"
    );
    console.log('=== ATTRACTIONS COLUMNS ===');
    console.log(cols.rows.map(r => r.column_name).join(', '));

    // 2. Check attractions
    const attractions = await pool.query(
      "SELECT * FROM attractions WHERE attraction_id IN (20, 21)"
    );
    console.log('\n=== ATTRACTIONS 20 & 21 ===');
    console.log(JSON.stringify(attractions.rows, null, 2));

    // 3. Test getApplicableRules for a weekend date (April 11, 2026 = Saturday)
    const dynamicPricingModel = require('../models/dynamicPricing.model');
    
    const snowParkRules = await dynamicPricingModel.getApplicableRules('attraction', 20, '2026-04-11');
    console.log('\n=== APPLICABLE RULES Snow Park (ID 20) on Sat 2026-04-11 ===');
    console.log(JSON.stringify(snowParkRules, null, 2));

    const madlabsRules = await dynamicPricingModel.getApplicableRules('attraction', 21, '2026-04-11');
    console.log('\n=== APPLICABLE RULES Madlabs (ID 21) on Sat 2026-04-11 ===');
    console.log(JSON.stringify(madlabsRules, null, 2));

    // 4. Test calculateDynamicPrice for both
    const dynamicPricingService = require('../services/dynamicPricingService');
    
    const snowParkPrice = await dynamicPricingService.calculateDynamicPrice({
      itemType: 'attraction',
      itemId: 20,
      basePrice: 650,
      date: new Date('2026-04-11'),
      time: '12:00:00',
      quantity: 2,
    });
    console.log('\n=== SNOW PARK PRICE CALC (2 tickets, Saturday) ===');
    console.log(JSON.stringify(snowParkPrice, null, 2));

    const madlabsPrice = await dynamicPricingService.calculateDynamicPrice({
      itemType: 'attraction',
      itemId: 21,
      basePrice: 500,
      date: new Date('2026-04-11'),
      time: '12:00:00',
      quantity: 2,
    });
    console.log('\n=== MADLABS PRICE CALC (2 tickets, Saturday) ===');
    console.log(JSON.stringify(madlabsPrice, null, 2));

    // 5. Test computeTotals for booking without slot
    const bookingService = require('../services/bookingService');
    
    const snowTotals = await bookingService.computeTotals({
      item_type: 'Attraction',
      attraction_id: 20,
      quantity: 2,
      booking_date: '2026-04-11',
    });
    console.log('\n=== SNOW PARK computeTotals (2 tickets, no slot) ===');
    console.log(JSON.stringify(snowTotals, null, 2));

    const madTotals = await bookingService.computeTotals({
      item_type: 'Attraction',
      attraction_id: 21,
      quantity: 2,
      booking_date: '2026-04-11',
    });
    console.log('\n=== MADLABS computeTotals (2 tickets, no slot) ===');
    console.log(JSON.stringify(madTotals, null, 2));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    process.exit(0);
  }
})();
