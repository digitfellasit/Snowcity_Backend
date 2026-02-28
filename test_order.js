const http = require('http');

async function checkOrder(path, label) {
    return new Promise((resolve) => {
        http.get(`https://app.snowcityblr.com/api${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const items = json.data || json;
                    console.log(`--- ${label} ---`);
                    if (Array.isArray(items)) {
                        items.slice(0, 5).forEach((item, idx) => {
                            const name = item.name || item.title || 'No Name';
                            const createdAt = item.created_at;
                            console.log(`${idx + 1}: ${name} (${createdAt})`);
                        });
                    } else {
                        console.log('No data array found. Keys:', Object.keys(json));
                        console.log('Raw sample:', data.substring(0, 200));
                    }
                } catch (e) {
                    console.error(`Failed to parse ${label}:`, e.message);
                }
                resolve();
            });
        }).on('error', (err) => {
            console.error(`Error ${label}:`, err.message);
            resolve();
        });
    });
}

async function test() {
    await checkOrder('/attractions?active=true', 'Attractions Order');
    await checkOrder('/combos?active=true', 'Combos Order');
    await checkOrder('/blogs?active=true&limit=10', 'Blogs Order');
}

test();
