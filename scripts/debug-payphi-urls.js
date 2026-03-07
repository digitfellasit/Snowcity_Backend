const axios = require('axios');
require('dotenv').config();

const BASE = 'https://qa.phicommerce.com/pg';
const urls = [
    'https://qa.phicommerce.com/pg/api/v2/initiateSale',
    'https://qa.phicommerce.com/pg/api/initiateSale',
    'https://qa.phicommerce.com/pg/v2/initiateSale',
    'https://qa.phicommerce.com/api/v2/initiateSale',
    'https://qa.phicommerce.com/pg/api/v2/authRedirect'
];

async function test() {
    for (const url of urls) {
        try {
            console.log(`Testing URL: ${url}`);
            // Send a GET request first just to see if it 404s
            await axios.get(url);
            console.log(`  ✅ ${url} is accessible (GET)`);
        } catch (err) {
            if (err.response) {
                if (err.response.status === 405) {
                    console.log(`  ✅ ${url} exists (405 Method Not Allowed - expected for GET)`);
                } else {
                    console.log(`  ❌ ${url} failed with status: ${err.response.status}`);
                }
            } else {
                console.log(`  ❌ ${url} error: ${err.message}`);
            }
        }
    }
}

test();
