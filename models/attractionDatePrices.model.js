const { pool } = require('../config/db');

async function getAttractionDatePrices(attractionId) {
  const { rows } = await pool.query(
    `SELECT * FROM attraction_date_prices
     WHERE attraction_id = $1
     ORDER BY price_date ASC`,
    [attractionId]
  );
  return rows;
}

async function getDatePrice(attractionId, date) {
  const { rows } = await pool.query(
    `SELECT * FROM attraction_date_prices
     WHERE attraction_id = $1 AND price_date = $2`,
    [attractionId, date]
  );
  return rows[0];
}

async function setDatePrice(attractionId, date, price) {
  const { rows } = await pool.query(
    `INSERT INTO attraction_date_prices (attraction_id, price_date, price)
     VALUES ($1, $2, $3)
     ON CONFLICT (attraction_id, price_date)
     DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()
     RETURNING *`,
    [attractionId, date, price]
  );
  return rows[0];
}

async function deleteDatePrice(attractionId, date) {
  const { rows } = await pool.query(
    `DELETE FROM attraction_date_prices
     WHERE attraction_id = $1 AND price_date = $2
     RETURNING *`,
    [attractionId, date]
  );
  return rows[0];
}

async function bulkSetDatePrices(attractionId, datePrices) {
  // datePrices is array of {date, price}
  const values = datePrices.map(dp => `(${attractionId}, '${dp.date}', ${dp.price})`).join(', ');
  const query = `
    INSERT INTO attraction_date_prices (attraction_id, price_date, price)
    VALUES ${values}
    ON CONFLICT (attraction_id, price_date)
    DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()
    RETURNING *`;
  const { rows } = await pool.query(query);
  return rows;
}

module.exports = {
  getAttractionDatePrices,
  getDatePrice,
  setDatePrice,
  deleteDatePrice,
  bulkSetDatePrices,
};
