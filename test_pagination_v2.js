const http = require('http');

const url = 'https://app.snowcityblr.com/api/blogs?page=1&limit=5&active=true';

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Status Code:', res.statusCode);
            console.log('Metadata:', JSON.stringify(json.meta, null, 2));
            console.log('Items Count:', Array.isArray(json.data) ? json.data.length : 'Not an array');
            if (json.data && json.data.length > 0) {
                console.log('First Item Sample:', {
                    blog_id: json.data[0].blog_id,
                    title: json.data[0].title
                });
            }
        } catch (e) {
            console.error('Failed to parse response:', e.message);
            console.log('Raw Data:', data.substring(0, 500));
        }
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
