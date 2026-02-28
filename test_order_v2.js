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
                    console.log(`\n=== ${label} ===`);
                    if (Array.isArray(items)) {
                        items.forEach((item, idx) => {
                            const name = item.name || item.title || 'No Name';
                            const id = item.attraction_id || item.combo_id || item.blog_id || '?';
                            const created = item.created_at || 'unknown';
                            console.log(`${idx + 1}. [ID:${id}] ${name} (${created})`);
                        });
                    } else {
                        console.log('No data array found');
                    }
                } catch (e) { console.error(`Failed ${label}:`, e.message); }
                resolve();
            });
        }).on('error', (err) => { resolve(); });
    });
}

async function start() {
    await checkOrder('/attractions?active=true', 'ATTRACTIONS');
    await checkOrder('/combos?active=true', 'COMBOS');
    await checkOrder('/blogs?active=true&limit=10', 'BLOGS');
}
start();
