const axios = require('axios');

async function test() {
    const baseUrl = 'http://localhost:5000/api'; // Assuming backend port is 5000
    try {
        console.log('Testing GET /api/blogs?page=1&limit=5...');
        const res = await axios.get(`${baseUrl}/blogs`, { params: { page: 1, limit: 5, active: true } });

        const { data, meta } = res.data;
        console.log('Response metadata:', JSON.stringify(meta, null, 2));

        if (Array.isArray(data)) {
            console.log(`Success: Received ${data.length} blogs.`);
        } else {
            console.error('Error: Data is not an array');
        }

        if (meta && typeof meta.totalCount === 'number') {
            console.log(`Success: Total count is ${meta.totalCount}`);
        } else {
            console.error('Error: meta.totalCount is missing or not a number');
        }

        if (meta && typeof meta.totalPages === 'number') {
            console.log(`Success: Total pages is ${meta.totalPages}`);
        }

    } catch (err) {
        console.error('Test failed:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
    }
}

test();
