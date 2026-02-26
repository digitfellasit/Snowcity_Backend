require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.VITE_ADMIN_API_BASE_URL || 'app.snowcityblr.com';

async function testAttractionSlotsAPI() {
  console.log('Testing attraction slots API endpoints...');

  try {
    // Test list attraction slots
    console.log('\n=== Testing GET /api/admin/attraction-slots ===');
    try {
      const response = await axios.get(`${API_BASE}/api/admin/attraction-slots`, {
        params: {
          attraction_id: 1,
          start_date: '2025-11-29',
          end_date: '2025-11-30'
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ GET attraction-slots SUCCESS');
      console.log('Response:', response.data);
      console.log('Number of slots:', response.data?.data?.length || 0);
    } catch (error) {
      console.log('❌ GET attraction-slots FAILED');
      console.log('Error:', error.response?.data || error.message);
    }

    // Test get specific slot
    console.log('\n=== Testing GET /api/admin/attraction-slots/:id ===');
    try {
      const response = await axios.get(`${API_BASE}/api/admin/attraction-slots/1919`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ GET attraction-slot by ID SUCCESS');
      console.log('Slot details:', response.data);
    } catch (error) {
      console.log('❌ GET attraction-slot by ID FAILED');
      console.log('Error:', error.response?.data || error.message);
    }

    console.log('\n=== API Test Summary ===');
    console.log('If you see SUCCESS messages above, the API is working!');
    console.log('If you see FAILED messages, check the backend server and logs.');

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testAttractionSlotsAPI();
