require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const results = {};

(async () => {
    try {
        // Test 1: Wednesday (DOW=3) should match Wednesday Offers (offer_id=11)
        const wed = '2026-03-04';
        const { rows: wedRows } = await pool.query(`
      SELECT o.offer_id, o.title, o.rule_type, r.day_type, r.specific_days, r.rule_discount_type, r.rule_discount_value
      FROM offers o JOIN offer_rules r ON r.offer_id = o.offer_id
      WHERE o.active = true
        AND (o.valid_from IS NULL OR o.valid_from <= $1::date)
        AND (o.valid_to IS NULL OR o.valid_to >= $1::date)
        AND r.target_type = 'attraction' AND r.target_id = 7
        AND (r.date_from IS NULL OR r.date_from <= $1::date)
        AND (r.date_to IS NULL OR r.date_to >= $1::date)
        AND (r.day_type IS NULL OR (r.day_type='weekday' AND EXTRACT(DOW FROM $1::date) BETWEEN 1 AND 5) OR (r.day_type='weekend' AND EXTRACT(DOW FROM $1::date) IN (0,6)) OR (r.day_type='custom' AND r.specific_days IS NOT NULL AND (EXTRACT(DOW FROM $1::date))=ANY(r.specific_days::int[])) OR r.day_type='holiday')
        AND (r.specific_days IS NULL OR array_length(r.specific_days::int[],1) IS NULL OR (EXTRACT(DOW FROM $1::date))=ANY(r.specific_days::int[]))
        AND (o.rule_type IN ('dynamic_pricing','date_slot_pricing','happy_hour','weekday_special') OR o.rule_type IS NULL)
    `, [wed]);
        results.wednesday = { date: wed, dow: 3, matches: wedRows, pass: wedRows.some(r => r.offer_id === 11) };

        // Test 2: Monday (DOW=1) should match Happy Hours (offer_id=9)
        const mon = '2026-03-02';
        const { rows: monRows } = await pool.query(`
      SELECT o.offer_id, o.title, o.rule_type, r.day_type, r.specific_days, r.time_from, r.time_to, r.rule_discount_type, r.rule_discount_value
      FROM offers o JOIN offer_rules r ON r.offer_id = o.offer_id
      WHERE o.active = true
        AND (o.valid_from IS NULL OR o.valid_from <= $1::date)
        AND (o.valid_to IS NULL OR o.valid_to >= $1::date)
        AND r.target_type = 'attraction' AND r.target_id = 7
        AND (r.date_from IS NULL OR r.date_from <= $1::date)
        AND (r.date_to IS NULL OR r.date_to >= $1::date)
        AND (r.day_type IS NULL OR (r.day_type='weekday' AND EXTRACT(DOW FROM $1::date) BETWEEN 1 AND 5) OR (r.day_type='weekend' AND EXTRACT(DOW FROM $1::date) IN (0,6)) OR (r.day_type='custom' AND r.specific_days IS NOT NULL AND (EXTRACT(DOW FROM $1::date))=ANY(r.specific_days::int[])) OR r.day_type='holiday')
        AND (r.specific_days IS NULL OR array_length(r.specific_days::int[],1) IS NULL OR (EXTRACT(DOW FROM $1::date))=ANY(r.specific_days::int[]))
        AND (o.rule_type IN ('dynamic_pricing','date_slot_pricing','happy_hour','weekday_special') OR o.rule_type IS NULL)
    `, [mon]);
        results.monday = { date: mon, dow: 1, matches: monRows, pass: monRows.some(r => r.offer_id === 9) };

        // Test 3: Saturday (DOW=6) should match weekend pricing (offer_id=12)
        const sat = '2026-03-07';
        const { rows: satRows } = await pool.query(`
      SELECT o.offer_id, o.title, o.rule_type, r.day_type, r.specific_days, r.rule_discount_type, r.rule_discount_value
      FROM offers o JOIN offer_rules r ON r.offer_id = o.offer_id
      WHERE o.active = true
        AND (o.valid_from IS NULL OR o.valid_from <= $1::date)
        AND (o.valid_to IS NULL OR o.valid_to >= $1::date)
        AND r.target_type = 'attraction' AND r.target_id = 7
        AND (r.date_from IS NULL OR r.date_from <= $1::date)
        AND (r.date_to IS NULL OR r.date_to >= $1::date)
        AND (r.day_type IS NULL OR (r.day_type='weekday' AND EXTRACT(DOW FROM $1::date) BETWEEN 1 AND 5) OR (r.day_type='weekend' AND EXTRACT(DOW FROM $1::date) IN (0,6)) OR (r.day_type='custom' AND r.specific_days IS NOT NULL AND (EXTRACT(DOW FROM $1::date))=ANY(r.specific_days::int[])) OR r.day_type='holiday')
        AND (r.specific_days IS NULL OR array_length(r.specific_days::int[],1) IS NULL OR (EXTRACT(DOW FROM $1::date))=ANY(r.specific_days::int[]))
        AND (o.rule_type IN ('dynamic_pricing','date_slot_pricing','happy_hour','weekday_special') OR o.rule_type IS NULL)
    `, [sat]);
        results.saturday = { date: sat, dow: 6, matches: satRows, pass: satRows.some(r => r.offer_id === 12) };

        // Test 4: Wednesday should NOT match Happy Hours (specific_days=[1,2,4,5] excludes 3)
        const { rows: wedHH } = await pool.query(`
      SELECT o.offer_id FROM offers o JOIN offer_rules r ON r.offer_id = o.offer_id
      WHERE o.offer_id = 9 AND r.day_type = 'custom'
        AND (EXTRACT(DOW FROM '2026-03-04'::date))=ANY(r.specific_days::int[])
    `);
        results.wednesday_no_happyhour = { pass: wedHH.length === 0, detail: 'Happy Hours should NOT match on Wednesday' };

        // Test 5: Priorities normalized
        const { rows: prioRows } = await pool.query('SELECT rule_id, priority FROM offer_rules');
        results.priorities = { all_100: prioRows.every(r => r.priority === 100), rules: prioRows };

        // Summary
        const allPass = results.wednesday.pass && results.monday.pass && results.saturday.pass && results.wednesday_no_happyhour.pass && results.priorities.all_100;
        results.summary = allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';

        fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2), 'utf8');
    } catch (err) {
        fs.writeFileSync('test_results.json', JSON.stringify({ error: err.message }), 'utf8');
    } finally {
        await pool.end();
        process.exit(0);
    }
})();
