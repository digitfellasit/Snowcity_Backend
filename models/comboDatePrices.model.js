const { pool } = require('../config/db');

async function getComboDatePrices(comboId) {
  const { rows } = await pool.query(
    `SELECT * FROM combo_date_prices
     WHERE combo_id = $1
     ORDER BY price_date ASC`,
    [comboId]
  );
  return rows;
}

async function getDatePrice(comboId, date) {
  const { rows } = await pool.query(
    `SELECT * FROM combo_date_prices
     WHERE combo_id = $1 AND price_date = $2`,
    [comboId, date]
  );
  return rows[0];
}

async function setDatePrice(comboId, date, price) {
  const { rows } = await pool.query(
    `INSERT INTO combo_date_prices (combo_id, price_date, price)
     VALUES ($1, $2, $3)
     ON CONFLICT (combo_id, price_date)
     DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()
     RETURNING *`,
    [comboId, date, price]
  );
  return rows[0];
}

async function deleteDatePrice(comboId, date) {
  const { rows } = await pool.query(
    `DELETE FROM combo_date_prices
     WHERE combo_id = $1 AND price_date = $2
     RETURNING *`,
    [comboId, date]
  );
  return rows[0];
}

async function bulkSetDatePrices(comboId, datePrices) {
  // datePrices is array of {date, price}
  const values = datePrices.map(dp => `(${comboId}, '${dp.date}', ${dp.price})`).join(', ');
  const query = `
    INSERT INTO combo_date_prices (combo_id, price_date, price)
    VALUES ${values}
    ON CONFLICT (combo_id, price_date)
    DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()
    RETURNING *`;
  const { rows } = await pool.query(query);
  return rows;
}

module.exports = {
  getComboDatePrices,
  getDatePrice,
  setDatePrice,
  deleteDatePrice,
  bulkSetDatePrices,
};
