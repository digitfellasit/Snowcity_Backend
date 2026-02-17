require('dotenv').config();

console.log('🔍 DATABASE AVAILABILITY CHECK...');

async function checkDatabase() {
  try {
    const axios = require('axios');

    console.log('\n🎯 Checking Combos:');
    const combosResponse = await axios.get('https://snowcity-backend-zjlj.onrender.com/api/combos');
    console.log('   Status:', combosResponse.status);
    console.log('   Count:', combosResponse.data?.data?.length || 0);

    if (combosResponse.data?.data?.length > 0) {
      console.log('   First Combo:');
      const firstCombo = combosResponse.data.data[0];
      console.log('     ID:', firstCombo.combo_id || firstCombo.id);
      console.log('     Name:', firstCombo.name);
      console.log('     Attractions:', firstCombo.attraction_ids);
    }

    console.log('\n🎢 Checking Attractions:');
    const attractionsResponse = await axios.get('https://snowcity-backend-zjlj.onrender.com/api/attractions');
    console.log('   Status:', attractionsResponse.status);
    console.log('   Count:', attractionsResponse.data?.data?.length || 0);

    if (attractionsResponse.data?.data?.length > 0) {
      console.log('   First Attraction:');
      const firstAttraction = attractionsResponse.data.data[0];
      console.log('     ID:', firstAttraction.attraction_id || firstAttraction.id);
      console.log('     Name:', firstAttraction.name || firstAttraction.title);
    }

    // Test with actual IDs
    if (combosResponse.data?.data?.length > 0) {
      const firstComboId = combosResponse.data.data[0].combo_id || combosResponse.data.data[0].id;
      console.log(`\n🎯 Testing Combo ${firstComboId}:`);

      try {
        const comboSlotsResponse = await axios.get(`https://snowcity-backend-zjlj.onrender.com/api/combos/${firstComboId}/slots?date=2025-11-29`);
        console.log('   Status:', comboSlotsResponse.status);
        console.log('   Slots:', comboSlotsResponse.data?.data?.length || 0);

        if (comboSlotsResponse.data?.data?.length > 0) {
          const firstSlot = comboSlotsResponse.data.data[0];
          console.log('   First Slot:', {
            combo_slot_id: firstSlot.combo_slot_id,
            start_time: firstSlot.start_time,
            end_time: firstSlot.end_time,
            combo_name: firstSlot.combo_name
          });
        }
      } catch (error) {
        console.log('   Error:', error.message);
        if (error.response) {
          console.log('   Status:', error.response.status);
          console.log('   Data:', error.response.data);
        }
      }
    }

    if (attractionsResponse.data?.data?.length > 0) {
      const firstAttractionId = attractionsResponse.data.data[0].attraction_id || attractionsResponse.data.data[0].id;
      console.log(`\n🎢 Testing Attraction ${firstAttractionId}:`);

      try {
        const attractionSlotsResponse = await axios.get(`https://snowcity-backend-zjlj.onrender.com/api/attractions/${firstAttractionId}/slots?date=2025-11-29`);
        console.log('   Status:', attractionSlotsResponse.status);
        console.log('   Slots:', attractionSlotsResponse.data?.data?.length || 0);

        if (attractionSlotsResponse.data?.data?.length > 0) {
          const firstSlot = attractionSlotsResponse.data.data[0];
          console.log('   First Slot:', {
            slot_id: firstSlot.slot_id,
            start_time: firstSlot.start_time,
            end_time: firstSlot.end_time,
            attraction_name: firstSlot.attraction_name
          });
        }
      } catch (error) {
        console.log('   Error:', error.message);
        if (error.response) {
          console.log('   Status:', error.response.status);
          console.log('   Data:', error.response.data);
        }
      }
    }

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

checkDatabase();
