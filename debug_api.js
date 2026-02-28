const http = require('http');

async function debugAPI(path) {
    return new Promise((resolve) => {
        http.get(`https://app.snowcityblr.com/api${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`\n\n=== DEBUG: ${path} ===`);
                    const items = json.data || json;
                    if (Array.isArray(items)) {
                        console.log('Count:', items.length);
                        items.forEach((it, i) => {
                            console.log(`${i + 1}. [ID:${it.attraction_id || it.combo_id || it.blog_id || '?'}] ${it.title || it.name || it.slug} (Created: ${it.created_at})`);
                        });
                    } else {
                        console.log('Not an array. JSON:', JSON.stringify(json, null, 2));
                    }
                } catch (e) {
                    console.log('Parse failed:', e.message);
                    console.log('Raw:', data.substring(0, 300));
                }
                resolve();
            });
        });
    });
}

async function run() {
    await debugAPI('/attractions?active=true&limit=100');
    await debugAPI('/blogs?active=true&limit=100');
}
run();
