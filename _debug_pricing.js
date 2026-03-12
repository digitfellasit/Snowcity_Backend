require('dotenv').config();
const dynamicPricingModel = require('./models/dynamicPricing.model');
const dynamicPricingService = require('./services/dynamicPricingService');
const comboService = require('./services/comboService');
const { pool } = require('./config/db');
const fs = require('fs');

async function test() {
  const out = [];
  const log = (msg) => { out.push(msg); console.log(msg); };
  try {
    const { rows: rules } = await pool.query('SELECT * FROM dynamic_pricing_rules WHERE active = true ORDER BY created_at DESC LIMIT 1');
    if (!rules.length) { log('No rules'); return; }
    const r = rules[0];
    log(`Rule #${r.rule_id}: target=${r.target_type}/${r.target_id} mode=${r.day_selection_mode} adj=${r.price_adjustment_type}/${r.price_adjustment_value}`);
    log(`child_price_adjustments=${JSON.stringify(r.child_price_adjustments)}`);
    log(`date_ranges=${JSON.stringify(r.date_ranges)}`);

    const combo = await comboService.getById(r.target_id);
    const bp = Number(combo?.total_price || combo?.combo_price || 0);
    log(`combo base_price=${bp}`);

    // Saturday
    const sat = '2026-03-14';
    const satRules = await dynamicPricingModel.getApplicableRules(r.target_type, r.target_id, sat);
    log(`SAT applicable=${satRules.length}`);
    if (satRules.length) {
      log(`SAT rule child_adj=${JSON.stringify(satRules[0].child_price_adjustments)}`);
    }
    const satResult = await dynamicPricingService.calculateDynamicPrice({
      itemType: 'combo', itemId: r.target_id, basePrice: bp, date: new Date(sat), time: '12:00:00', quantity: 1
    });
    log(`SAT finalPrice=${satResult.finalPrice} orig=${satResult.originalPrice} rules=${satResult.appliedRules.length}`);
    if (satResult.appliedRules.length) log(`SAT appliedRule=${JSON.stringify(satResult.appliedRules[0])}`);

    // Thursday
    const thu = '2026-03-12';
    const thuResult = await dynamicPricingService.calculateDynamicPrice({
      itemType: 'combo', itemId: r.target_id, basePrice: bp, date: new Date(thu), time: '12:00:00', quantity: 1
    });
    log(`THU finalPrice=${thuResult.finalPrice} rules=${thuResult.appliedRules.length}`);
  } catch (e) {
    log(`ERROR: ${e.message}\n${e.stack}`);
  } finally {
    fs.writeFileSync('_debug_output.txt', out.join('\n'));
    await pool.end();
  }
}
test();
