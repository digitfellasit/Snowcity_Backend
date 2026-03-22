// Quick script to check offer_rules schema on the live DB
const { Pool } = require('pg');

const pool = new Pool({
  host: 'database-1.cf4cq0uc02xu.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'snowcity',
  user: 'postgres',
  password: 'Digit4409!~',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const fs = require('fs');
  let out = '';
  const log = (msg) => { out += msg + '\n'; };

  try {
    const { rows: cols } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'offer_rules'
      ORDER BY ordinal_position
    `);
    log('=== offer_rules columns ===');
    cols.forEach(c => log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default}`));

    const buyQtyCol = cols.find(c => c.column_name === 'buy_qty');
    log(`\nbuy_qty column exists: ${!!buyQtyCol}`);

    const { rows: offers } = await pool.query(`
      SELECT o.offer_id, o.title, o.rule_type, o.active
      FROM offers o
      WHERE o.rule_type = 'buy_x_get_y'
      ORDER BY o.offer_id
    `);
    log('\n=== buy_x_get_y offers ===');
    if (offers.length === 0) log('  (none found)');
    else offers.forEach(o => log(`  #${o.offer_id} "${o.title}" active=${o.active}`));

    if (offers.length > 0) {
      const ids = offers.map(o => o.offer_id);
      const { rows: rules } = await pool.query(`
        SELECT rule_id, offer_id, target_type, target_id, applies_to_all,
               buy_qty, get_qty, get_target_type, get_target_id, get_discount_type, get_discount_value,
               day_type, specific_days
        FROM offer_rules
        WHERE offer_id = ANY($1)
      `, [ids]);
      log('\n=== offer_rules for buy_x_get_y offers ===');
      rules.forEach(r => {
        log(`  rule#${r.rule_id} offer#${r.offer_id}`);
        log(`    target=${r.target_type}/${r.target_id} applies_all=${r.applies_to_all}`);
        log(`    buy_qty=${r.buy_qty} get_qty=${r.get_qty}`);
        log(`    get_target=${r.get_target_type}/${r.get_target_id}`);
        log(`    discount=${r.get_discount_type}/${r.get_discount_value}`);
        log(`    day=${r.day_type} days=${JSON.stringify(r.specific_days)}`);
      });
    }

    // Also check ALL active offers for the frontend listing
    const { rows: allOffers } = await pool.query(`SELECT offer_id, title, rule_type, active FROM offers WHERE active = true ORDER BY offer_id`);
    log('\n=== ALL active offers ===');
    allOffers.forEach(o => log(`  #${o.offer_id} "${o.title}" type=${o.rule_type} active=${o.active}`));

  } catch (err) {
    log('Error: ' + err.message);
  } finally {
    await pool.end();
  }
  fs.writeFileSync('_db_result.txt', out, 'utf8');
  console.log('Done. See _db_result.txt');
}

main();
