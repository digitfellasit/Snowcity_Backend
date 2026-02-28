const http = require('http');
const fs = require('fs');

const logPath = 'debug_final_4.log';
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logPath, msg + '\n');
};

async function debugAPI(path) {
    // Add unique param to bypass cache
    const separator = path.includes('?') ? '&' : '?';
    const fullPath = `${path}${separator}_t=${Date.now()}`;

    return new Promise((resolve) => {
        http.get(`https://app.snowcityblr.com/api${fullPath}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    log(`\n\n=== DEBUG: ${fullPath} ===`);
                    const items = json.data;
                    if (Array.isArray(items)) {
                        log(`Count: ${items.length}`);
                        items.forEach((it, i) => {
                            log(`${i + 1}. [ID:${it.blog_id || it.id || '?'}] ${it.title || it.name} (Created: ${it.created_at})`);
                        });
                    } else {
                        log('NOT AN ARRAY. json.data type: ' + typeof json.data);
                        log('Full JSON Keys: ' + Object.keys(json).join(', '));
                        log('Data Sample: ' + JSON.stringify(json.data).substring(0, 500));
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
}
run();
