require('dotenv').config();

console.log('🔍 DEBUGGING TIMING ISSUE...');
console.log('\n🚨 PROBLEM:');
console.log('User selected 2:00 PM - 4:00 PM but seeing 7:56 AM - 9:56 AM');
console.log('This suggests timezone or time format conversion issues');

console.log('\n🔧 POTENTIAL CAUSES:');
console.log('1. Timezone conversion issues');
console.log('2. 24-hour to 12-hour format conversion');
console.log('3. Virtual slot ID parsing errors');
console.log('4. Database time storage format issues');

async function testTimeFormatting() {
  console.log('\n🧪 TESTING TIME FORMATTING:');

  // Test the formatTime12Hour function from frontend
  const formatTime12Hour = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Test times
  const testTimes = [
    '14:00:00', // 2:00 PM
    '16:00:00', // 4:00 PM
    '07:56:00', // 7:56 AM
    '09:56:00', // 9:56 AM
    '10:00:00', // 10:00 AM
    '22:00:00', // 10:00 PM
  ];

  console.log('\n📋 Time Format Tests:');
  testTimes.forEach(time => {
    const formatted = formatTime12Hour(time);
    console.log(`   ${time} → ${formatted}`);
  });

  // Test virtual slot ID parsing
  console.log('\n🎰 Virtual Slot ID Tests:');
  const virtualSlotIds = [
    '20251129-14', // Should be 2:00 PM
    '20251129-16', // Should be 4:00 PM
    '20251129-10', // Should be 10:00 AM
    '20251129-7',  // Should be 7:00 AM
  ];

  virtualSlotIds.forEach(slotId => {
    if (slotId && typeof slotId === 'string' && slotId.includes('-')) {
      const [date, hourStr] = slotId.split('-');
      const hour = parseInt(hourStr);
      const booking_time = `${String(hour).padStart(2, '0')}:00:00`;
      const end_time = `${String((hour + 2) % 24).padStart(2, '0')}:00:00`;
      const formatted_start = formatTime12Hour(booking_time);
      const formatted_end = formatTime12Hour(end_time);
      console.log(`   ${slotId} → ${booking_time} → ${formatted_start} - ${formatted_end}`);
    }
  });

  // Test timezone issues
  console.log('\n🌍 Timezone Tests:');
  const now = new Date();
  console.log('   Current local time:', now.toLocaleString());
  console.log('   Current UTC time:', now.toISOString());
  console.log('   Current time 24h:', now.toTimeString().split(' ')[0]);

  // Test date parsing
  console.log('\n📅 Date Parsing Tests:');
  const testDates = [
    '2025-11-29',
    '2025/11/29',
    new Date('2025-11-29'),
  ];

  testDates.forEach(date => {
    const d = new Date(date);
    console.log(`   ${date} → ${d.toISOString()}`);
  });
}

async function testDatabaseConnection() {
  console.log('\n🗄️ DATABASE CONNECTION TEST:');
  try {
    const axios = require('axios');

    // Test a simple API call
    const response = await axios.get('https://app.snowcityblr.com/api/combos');
    console.log('   ✅ API Connection: OK');
    console.log('   Combos found:', response.data?.data?.length || 0);

    // Test combo slots
    if (response.data?.data?.length > 0) {
      const comboId = response.data.data[0].combo_id || response.data.data[0].id;
      const slotsResponse = await axios.get(`https://app.snowcityblr.com/api/combos/${comboId}/slots?date=2025-11-29`);
      console.log('   Combo slots found:', slotsResponse.data?.data?.length || 0);

      if (slotsResponse.data?.data?.length > 0) {
        const firstSlot = slotsResponse.data.data[0];
        console.log('   First slot times:');
        console.log('     start_time:', firstSlot.start_time);
        console.log('     end_time:', firstSlot.end_time);

        // Format the times
        const formatTime12Hour = (time24) => {
          if (!time24) return '';
          const [hours, minutes] = time24.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${minutes} ${ampm}`;
        };

        console.log('     formatted:', formatTime12Hour(firstSlot.start_time), '-', formatTime12Hour(firstSlot.end_time));
      }
    }

  } catch (error) {
    console.log('   ❌ Database/API Error:', error.message);
  }
}

async function checkBookingsTable() {
  console.log('\n📋 BOOKINGS TABLE CHECK:');
  try {
    // This would require direct database access
    console.log('   📝 To check bookings table:');
    console.log('   1. Connect to database');
    console.log('   2. SELECT * FROM bookings ORDER BY created_at DESC LIMIT 5');
    console.log('   3. Check slot_start_time and slot_end_time fields');
    console.log('   4. Compare with what user selected');

    console.log('\n   🔍 Expected fields to check:');
    console.log('   - booking_time');
    console.log('   - slot_start_time');
    console.log('   - slot_end_time');
    console.log('   - slot_label');

  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
}

async function runDebugTests() {
  console.log('🚀 Starting debug tests...');

  await testTimeFormatting();
  await testDatabaseConnection();
  await checkBookingsTable();

  console.log('\n🎯 DEBUGGING CHECKLIST:');
  console.log('\n1. 🕐 Check Frontend Time Selection:');
  console.log('   - What time does user actually select?');
  console.log('   - What is the selectedSlot object?');
  console.log('   - What is the slotLabel value?');

  console.log('\n2. 📤 Check Booking Payload:');
  console.log('   - What values are sent to backend?');
  console.log('   - Are slot_start_time and slot_end_time correct?');

  console.log('\n3. 🗄️ Check Database Storage:');
  console.log('   - What values are stored in database?');
  console.log('   - Are they in the correct format?');

  console.log('\n4. 📋 Check Display Logic:');
  console.log('   - How are times retrieved from database?');
  console.log('   - How are they formatted for display?');

  console.log('\n5. 🌍 Check Timezone Issues:');
  console.log('   - Is timezone conversion happening?');
  console.log('   - Are times being stored in UTC vs local time?');

  console.log('\n✨ NEXT STEPS:');
  console.log('1. Add console.log statements to track time values');
  console.log('2. Check browser network tab for request payload');
  console.log('3. Check database for stored values');
  console.log('4. Compare expected vs actual values at each step');
}

runDebugTests().catch(console.error);
