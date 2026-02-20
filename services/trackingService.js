// services/trackingService.js
// Conversion tracking: visit logging & booking attribution
const { pool } = require('../config/db');

/**
 * Log a page visit with UTM parameters and click IDs.
 */
async function logVisit({
    session_id,
    user_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    fbclid,
    landing_page,
}) {
    if (!session_id) return null;

    const result = await pool.query(
        `INSERT INTO visits (
      id, session_id, user_id, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, gclid, fbclid, landing_page
    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id`,
        [
            session_id,
            user_id || null,
            utm_source || null,
            utm_medium || null,
            utm_campaign || null,
            utm_content || null,
            utm_term || null,
            gclid || null,
            fbclid || null,
            landing_page || null,
        ]
    );

    return result.rows[0];
}

/**
 * Attribute a booking to its traffic source using session_id.
 * Looks up the first (earliest) visit for the session to determine first-touch attribution.
 */
async function attributeBooking({ session_id, order_id, amount, user_id }) {
    if (!session_id) return null;

    // First-touch attribution: get the earliest visit for this session
    const visitResult = await pool.query(
        `SELECT utm_source, utm_campaign
     FROM visits
     WHERE session_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
        [session_id]
    );

    const source = visitResult.rows[0]?.utm_source || 'direct';
    const campaign = visitResult.rows[0]?.utm_campaign || null;

    const result = await pool.query(
        `INSERT INTO booking_visits (
      id, user_id, session_id, order_id, amount, source, campaign
    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
    RETURNING id`,
        [user_id || null, session_id, order_id || null, amount || 0, source, campaign]
    );

    return { id: result.rows[0]?.id, source, campaign };
}

/**
 * Get conversion analytics summary grouped by source.
 * Joins visits with booking_visits for visitors, bookings, revenue, conv%, ROAS.
 */
async function getConversionSummary({ from, to } = {}) {
    let dateFilter = '';
    const params = [];

    if (from) {
        params.push(from);
        dateFilter += ` AND v.created_at >= $${params.length}::timestamptz`;
    }
    if (to) {
        params.push(to);
        dateFilter += ` AND v.created_at <= $${params.length}::timestamptz`;
    }

    const sql = `
    SELECT
      COALESCE(v.utm_source, 'direct') AS source,
      COUNT(DISTINCT v.session_id) AS visitors,
      COUNT(DISTINCT bv.id) AS bookings,
      COALESCE(SUM(bv.amount), 0) AS revenue,
      CASE
        WHEN COUNT(DISTINCT v.session_id) > 0
        THEN ROUND(
          (COUNT(DISTINCT bv.id)::decimal / COUNT(DISTINCT v.session_id)) * 100, 2
        )
        ELSE 0
      END AS conversion_rate
    FROM visits v
    LEFT JOIN booking_visits bv ON v.session_id = bv.session_id
    WHERE 1=1 ${dateFilter}
    GROUP BY COALESCE(v.utm_source, 'direct')
    ORDER BY revenue DESC
  `;

    const result = await pool.query(sql, params);

    // Attach ROAS from ad_spend if available
    const spendResult = await pool.query(
        `SELECT source, SUM(spend) AS total_spend FROM ad_spend GROUP BY source`
    );
    const spendMap = {};
    for (const row of spendResult.rows) {
        spendMap[row.source] = Number(row.total_spend) || 0;
    }

    return result.rows.map((row) => {
        const spend = spendMap[row.source] || 0;
        return {
            ...row,
            visitors: Number(row.visitors),
            bookings: Number(row.bookings),
            revenue: Number(row.revenue),
            conversion_rate: Number(row.conversion_rate),
            spend,
            roas: spend > 0 ? Number((Number(row.revenue) / spend).toFixed(2)) : null,
        };
    });
}

/**
 * Get totals across all sources.
 */
async function getConversionTotals({ from, to } = {}) {
    let dateFilter = '';
    const params = [];

    if (from) {
        params.push(from);
        dateFilter += ` AND created_at >= $${params.length}::timestamptz`;
    }
    if (to) {
        params.push(to);
        dateFilter += ` AND created_at <= $${params.length}::timestamptz`;
    }

    const visitorsRes = await pool.query(
        `SELECT COUNT(DISTINCT session_id) AS total_visitors
     FROM visits WHERE 1=1 ${dateFilter}`,
        params
    );

    // Re-create params for booking query with same date filter applied to booking_visits
    const bParams = [];
    let bDateFilter = '';
    if (from) {
        bParams.push(from);
        bDateFilter += ` AND created_at >= $${bParams.length}::timestamptz`;
    }
    if (to) {
        bParams.push(to);
        bDateFilter += ` AND created_at <= $${bParams.length}::timestamptz`;
    }

    const bookingsRes = await pool.query(
        `SELECT COUNT(*) AS total_bookings, COALESCE(SUM(amount), 0) AS total_revenue
     FROM booking_visits WHERE 1=1 ${bDateFilter}`,
        bParams
    );

    const totalVisitors = Number(visitorsRes.rows[0]?.total_visitors) || 0;
    const totalBookings = Number(bookingsRes.rows[0]?.total_bookings) || 0;
    const totalRevenue = Number(bookingsRes.rows[0]?.total_revenue) || 0;

    return {
        total_visitors: totalVisitors,
        total_bookings: totalBookings,
        total_revenue: totalRevenue,
        conversion_rate: totalVisitors > 0
            ? Number(((totalBookings / totalVisitors) * 100).toFixed(2))
            : 0,
    };
}

/**
 * CRUD for ad_spend table.
 */
async function listAdSpend() {
    const result = await pool.query(
        `SELECT * FROM ad_spend ORDER BY created_at DESC`
    );
    return result.rows;
}

async function createAdSpend({ source, campaign, spend, period_start, period_end }) {
    const result = await pool.query(
        `INSERT INTO ad_spend (source, campaign, spend, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
        [source, campaign || null, spend, period_start || null, period_end || null]
    );
    return result.rows[0];
}

async function deleteAdSpend(id) {
    await pool.query(`DELETE FROM ad_spend WHERE id = $1`, [id]);
}

module.exports = {
    logVisit,
    attributeBooking,
    getConversionSummary,
    getConversionTotals,
    listAdSpend,
    createAdSpend,
    deleteAdSpend,
};
