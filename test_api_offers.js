require('dotenv').config();
const http = require('http');
const fs = require('fs');

function fetchSlots(date) {
    return new Promise((resolve, reject) => {
        const url = `https://app.snowcityblr.com/api/slots?attraction_id=7&date=${date}`;
        http.get(url, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch (e) { resolve({ error: d }); }
            });
        }).on('error', reject);
    });
}

(async () => {
    const results = {};

    // Wednesday - should show ₹150 discount
    const wed = await fetchSlots('2026-03-04');
    const wedSlot = wed.data?.[0];
    results.wednesday = {
        date: '2026-03-04',
        base_price: wedSlot?.base_price,
        final_price: wedSlot?.price,
        discount: wedSlot?.discount_amount,
        applied_rules: wedSlot?.applied_rules?.map(r => ({ title: r.offerTitle, discount: r.discountAmount, type: r.discountType })),
        slot_count: wed.data?.length
    };

    // Monday - should show Happy Hour ₹150 discount (for 10:00-12:59 slots only)
    const mon = await fetchSlots('2026-03-02');
    const monSlot10 = mon.data?.find(s => s.start_time === '10:00:00');
    const monSlot14 = mon.data?.find(s => s.start_time === '14:00:00');
    results.monday = {
        date: '2026-03-02',
        slot_10h: {
            base_price: monSlot10?.base_price,
            final_price: monSlot10?.price,
            discount: monSlot10?.discount_amount,
            applied_rules: monSlot10?.applied_rules?.map(r => ({ title: r.offerTitle, discount: r.discountAmount }))
        },
        slot_14h: {
            base_price: monSlot14?.base_price,
            final_price: monSlot14?.price,
            discount: monSlot14?.discount_amount,
            applied_rules: monSlot14?.applied_rules
        },
        slot_count: mon.data?.length
    };

    // Saturday - should show weekend dynamic pricing (-₹100 = price increase)
    const sat = await fetchSlots('2026-03-07');
    const satSlot = sat.data?.[0];
    results.saturday = {
        date: '2026-03-07',
        base_price: satSlot?.base_price,
        final_price: satSlot?.price,
        discount: satSlot?.discount_amount,
        applied_rules: satSlot?.applied_rules?.map(r => ({ title: r.offerTitle, discount: r.discountAmount, type: r.discountType })),
        slot_count: sat.data?.length
    };

    fs.writeFileSync('api_test_results.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('Done');
    process.exit(0);
})();
