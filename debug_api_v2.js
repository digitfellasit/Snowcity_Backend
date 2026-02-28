const http = require('http');
const fs = require('fs');

const logPath = 'debug_final.log';
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logPath, msg + '\n');
};

async function debugAPI(path) {
    return new Promise((resolve) => {
        http.get(`https://app.snowcityblr.com/api${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    log(`\n\n=== DEBUG: ${path} ===`);
                    const items = json.data || json;
                    if (Array.isArray(items)) {
                        log(`Count: ${items.length}`);
                        items.forEach((it, i) => {
                            log(`${i + 1}. [ID:${it.attraction_id || it.combo_id || it.blog_id || '?'}] ${it.title || it.name || it.slug} (Created: ${it.created_at})`);
                        });
                    } else {
                        log('Not an array. JSON keys: ' + Object.keys(json).join(', '));
                        log('Data snippet: ' + JSON.stringify(items).substring(0, 500));
                    }
                } catch (e) {
                    log('Parse failed: ' + e.message);
                    log('Raw: ' + data.substring(0, 300));
                }
                resolve();
            });
        });
    });
}

async function run() {
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    await debugAPI('/attractions?active=true&limit=100');
    await debugAPI('/blogs?active=true&limit=100');
    await debugAPI('/combos?active=true');
}
run();
