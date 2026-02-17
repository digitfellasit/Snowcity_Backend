const { buildTicketTemplateDataForOrder } = require('./services/interaktService');

// Mock data for testing multiple attractions scenario
const mockOrderData = {
  order_id: 12345,
  order_ref: 'TEST123',
  user_id: 1001,
  user_name: 'John Doe',
  phone: '9876543210',
  whatsapp_consent: true,
  items: [
    {
      item_title: 'Snow City',
      quantity: 2,
      booking_date: '2025-12-25',
      slot_start_time: '10:00:00',
      slot_end_time: '12:00:00',
      addons: [
        { title: 'Snow Gear', quantity: 2, addon_id: 'gear1' },
        { title: 'Hot Chocolate', quantity: 1, addon_id: 'drink1' }
      ]
    },
    {
      item_title: 'Mad Lab',
      quantity: 1,
      booking_date: '2025-12-25',
      slot_start_time: '14:30:00',
      slot_end_time: '16:00:00',
      addons: [
        { title: 'Lab Coat', quantity: 1, addon_id: 'coat1' }
      ]
    },
    {
      item_title: 'Combo Package',
      quantity: 1,
      item_type: 'Combo',
      booking_date: '2025-12-26',
      slot_start_time: '09:00:00',
      slot_end_time: '13:00:00',
      addons: []
    }
  ]
};

// Mock the database and model functions
const mockPool = {
  query: async (sql, params) => {
    if (sql.includes('SELECT o.order_id')) {
      return {
        rows: [{
          order_id: 12345,
          order_ref: 'TEST123',
          user_id: 1001,
          user_name: 'John Doe',
          phone: '9876543210',
          whatsapp_consent: true
        }]
      };
    }
    return { rows: [] };
  }
};

// Mock the bookings model
const mockBookingsModel = {
  getOrderWithDetails: async (orderId) => {
    return mockOrderData;
  }
};

// Override the require statements to use our mocks
const originalRequire = require;
require = function (id) {
  if (id === '../config/db') {
    return { pool: mockPool };
  }
  if (id === '../models/bookings.model') {
    return mockBookingsModel;
  }
  if (id === '../config/messaging') {
    return {
      APP_URL: 'https://snowcity-backend-zjlj.onrender.com',
      interakt: {
        apiUrl: 'https://api.interakt.ai/v1/public/message/',
        apiKey: 'test-key',
        sender: 'SnowCity'
      }
    };
  }
  return originalRequire(id);
};

async function testWhatsAppMessaging() {
  console.log('🧪 Testing WhatsApp Messaging System\n');

  try {
    // Test the template data building
    const templateData = await buildTicketTemplateDataForOrder(12345);

    console.log('✅ Template Data Built Successfully:');
    console.log('=====================================');
    console.log('Order ID:', templateData.order_id);
    console.log('Order Ref:', templateData.order_ref);
    console.log('User Name:', templateData.user_name);
    console.log('Phone:', templateData.phone);
    console.log('WhatsApp Consent:', templateData.whatsapp_consent);
    console.log('\n📋 Attractions ({{2}}):');
    console.log('========================');
    console.log(templateData.itemsText);
    console.log('\n🎯 Add-ons ({{3}}):');
    console.log('==================');
    console.log(templateData.addonsText);

    // Test the message format
    console.log('\n📱 Final WhatsApp Message Format:');
    console.log('==================================');
    console.log(`Hi ${templateData.user_name},`);
    console.log('');
    console.log('Thank you for booking with Snow City Bengaluru. Your payment is successful and your ticket(s) are confirmed for:');
    console.log('');
    console.log(templateData.itemsText);
    console.log('');
    console.log('Add-ons / Extras');
    console.log('================');
    console.log(templateData.addonsText);
    console.log('');
    console.log('The ticket PDF is attached.');

    console.log('\n✅ Test completed successfully!');

    // Verify the improvements
    console.log('\n🔍 Verification:');
    console.log('===============');

    // Check if attractions are grouped by date
    const hasDateGrouping = templateData.itemsText.includes('2025-12-25:') && templateData.itemsText.includes('2025-12-26:');
    console.log(`✓ Attractions grouped by date: ${hasDateGrouping ? 'YES' : 'NO'}`);

    // Check if time formatting is correct
    const hasCorrectTimeFormat = templateData.itemsText.includes('10:00 AM') && templateData.itemsText.includes('2:30 PM');
    console.log(`✓ Time format (12-hour): ${hasCorrectTimeFormat ? 'YES' : 'NO'}`);

    // Check if multiple attractions on same date are combined
    const hasCombinedAttractions = templateData.itemsText.includes('Snow City (Qty: 2) (10:00 AM - 12:00 PM), Mad Lab (Qty: 1) (2:30 PM - 4:00 PM)');
    console.log(`✓ Multiple attractions combined: ${hasCombinedAttractions ? 'YES' : 'NO'}`);

    // Check if add-ons are properly aggregated
    const hasAggregatedAddons = templateData.addonsText.includes('Snow Gear (2x)') && templateData.addonsText.includes('Hot Chocolate (1x)');
    console.log(`✓ Add-ons aggregated: ${hasAggregatedAddons ? 'YES' : 'NO'}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testWhatsAppMessaging();
}

module.exports = { testWhatsAppMessaging };
