const { pool } = require('../config/db');

async function createConsolidatedNaming(payload) {
  const { product_type, price_card_name, product_name, ref_price } = payload;
  const { rows } = await pool.query(
    `INSERT INTO consolidated_namings (product_type, price_card_name, product_name, ref_price)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [product_type, price_card_name, product_name, ref_price]
  );
  return rows[0];
}

async function listConsolidatedNamings() {
  const { rows } = await pool.query(`SELECT * FROM consolidated_namings ORDER BY created_at DESC`);
  return rows;
}

async function updateConsolidatedNaming(id, payload) {
  const { product_type, price_card_name, product_name, ref_price } = payload;
  const { rows } = await pool.query(
    `UPDATE consolidated_namings 
     SET product_type = $1, price_card_name = $2, product_name = $3, ref_price = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [product_type, price_card_name, product_name, ref_price, id]
  );
  return rows[0];
}

async function deleteConsolidatedNaming(id) {
  const { rowCount } = await pool.query(`DELETE FROM consolidated_namings WHERE id = $1`, [id]);
  return rowCount > 0;
}

module.exports = {
  createConsolidatedNaming,
  listConsolidatedNamings,
  updateConsolidatedNaming,
  deleteConsolidatedNaming,
};
