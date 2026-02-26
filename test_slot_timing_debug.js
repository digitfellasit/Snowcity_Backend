require('dotenv').config();

console.log('🔍 SLOT TIMING DEBUG TEST...');
console.log('\n🧪 Testing API Endpoints:');

async function testComboSlotsAPI() {
  console.log('\n🎯 Testing Combo Slots API:');
  try {
    const axios = require('axios');
    const response = await axios.get(`https://app.snowcity.blr/api/combos/1/slots?date=2025-11-29`);
    console.log('✅ Combo Slots API Response:');
    console.log('   Status:', response.status);
    console.log('   Data Count:', response.data?.data?.length || 0);

    if (response.data?.data?.length > 0) {
      const firstSlot = response.data.data[0];
      console.log('   First Slot Sample:');
      console.log('     combo_slot_id:', firstSlot.combo_slot_id);
      console.log('     combo_id:', firstSlot.combo_id);
      console.log('     combo_name:', firstSlot.combo_name);
      console.log('     start_date:', firstSlot.start_date);
      console.log('     start_time:', firstSlot.start_time);
      console.log('     end_time:', firstSlot.end_time);
      console.log('     capacity:', firstSlot.capacity);
      console.log('     price:', firstSlot.price);

      // Test timing format
      const formatTime12Hour = (time24) => {
        if (!time24) return '';
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
      };

      const start = formatTime12Hour(firstSlot.start_time);
      const end = formatTime12Hour(firstSlot.end_time);
      const timeText = start && end ? `${start} → ${end}` : '';

      console.log('   🕐 Formatted Timing:', timeText);
    } else {
      console.log('   ❌ No slots returned');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }
}

async function testAttractionSlotsAPI() {
  console.log('\n🎢 Testing Attraction Slots API:');
  try {
    const axios = require('axios');
    const response = await axios.get(`https://app.snowcity.blr/api/attractions/1/slots?date=2025-11-29`);
    console.log('✅ Attraction Slots API Response:');
    console.log('   Status:', response.status);
    console.log('   Data Count:', response.data?.data?.length || 0);

    if (response.data?.data?.length > 0) {
      const firstSlot = response.data.data[0];
      console.log('   First Slot Sample:');
      console.log('     slot_id:', firstSlot.slot_id);
      console.log('     attraction_id:', firstSlot.attraction_id);
      console.log('     attraction_name:', firstSlot.attraction_name);
      console.log('     start_date:', firstSlot.start_date);
      console.log('     start_time:', firstSlot.start_time);
      console.log('     end_time:', firstSlot.end_time);
      console.log('     capacity:', firstSlot.capacity);
      console.log('     price:', firstSlot.price);

      // Test timing format
      const formatTime12Hour = (time24) => {
        if (!time24) return '';
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
      };

      const start = formatTime12Hour(firstSlot.start_time);
      const end = formatTime12Hour(firstSlot.end_time);
      const timeText = start && end ? `${start} → ${end}` : '';

      console.log('   🕐 Formatted Timing:', timeText);
    } else {
      console.log('   ❌ No slots returned');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }
}

async function testDirectSlotsAPI() {
  console.log('\n🔍 Testing Direct Slots API:');
  try {
    const axios = require('axios');
    const response = await axios.get(`https://app.snowcity.blr/api/slots?attraction_id=1&date=2025-11-29`);
    console.log('✅ Direct Slots API Response:');
    console.log('   Status:', response.status);
    console.log('   Data Count:', response.data?.data?.length || 0);

    if (response.data?.data?.length > 0) {
      const firstSlot = response.data.data[0];
      console.log('   First Slot Sample:');
      console.log('     slot_id:', firstSlot.slot_id);
      console.log('     attraction_id:', firstSlot.attraction_id);
      console.log('     start_date:', firstSlot.start_date);
      console.log('     start_time:', firstSlot.start_time);
      console.log('     end_time:', firstSlot.end_time);
      console.log('     capacity:', firstSlot.capacity);
      console.log('     price:', firstSlot.price);

      // Test timing format
      const formatTime12Hour = (time24) => {
        if (!time24) return '';
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
      };

      const start = formatTime12Hour(firstSlot.start_time);
      const end = formatTime12Hour(firstSlot.end_time);
      const timeText = start && end ? `${start} → ${end}` : '';

      console.log('   🕐 Formatted Timing:', timeText);
    } else {
      console.log('   ❌ No slots returned');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }
}

async function runTests() {
  console.log('🚀 Starting API Tests...');
  console.log('📅 Testing Date: 2025-11-29');
  console.log('🕐 Expected Hours: 10:00 AM to 8:00 PM');

  await testComboSlotsAPI();
  await testAttractionSlotsAPI();
  await testDirectSlotsAPI();

  console.log('\n🎯 FRONTEND DEBUGGING TIPS:');
  console.log('\n1. Open browser dev tools (F12)');
  console.log('2. Go to Network tab');
  console.log('3. Navigate to combo or attraction page');
  console.log('4. Select a date in calendar');
  console.log('5. Look for API calls:');
  console.log('   - /api/combos/:id/slots?date=YYYY-MM-DD');
  console.log('   - /api/attractions/:id/slots?date=YYYY-MM-DD');
  console.log('   - /api/slots?attraction_id=1&date=YYYY-MM-DD');
  console.log('6. Check response data for start_time and end_time fields');
  console.log('7. Check console for any JavaScript errors');

  console.log('\n🔍 Expected Response Structure:');
  console.log('{');
  console.log('  data: [');
  console.log('    {');
  console.log('      combo_slot_id: "combo-20251129-10",');
  console.log('      start_time: "10:00:00",');
  console.log('      end_time: "13:00:00",');
  console.log('      ... other fields');
  console.log('    }');
  console.log('  ]');
  console.log('}');

  console.log('\n✨ If timing is still not visible:');
  console.log('1. Check if API returns timing data');
  console.log('2. Check if frontend processes timing correctly');
  console.log('3. Check if CSS is hiding the timing display');
  console.log('4. Check browser console for errors');
}

runTests().catch(console.error);
