// admin/models/admin.model.js
const { pool } = require('../../config/db');

const ADMIN_ROLES = ['root', 'admin', 'subadmin', 'superadmin', 'gm', 'staff', 'editor'];

function sanitizeGranularity(granularity) {
  const g = String(granularity || 'day').toLowerCase();
  return ['day', 'week', 'month'].includes(g) ? g : 'day';
}

// Dashboard summary KPIs (paid vs pending, root bookings only)
async function getDashboardSummary({ from = null, to = null, attraction_id = null } = {}) {
  const sql = `
    SELECT
      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.payment_status = 'Completed'
      ) AS total_bookings,

      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.payment_status <> 'Completed'
      ) AS pending_bookings,

      COALESCE(SUM(CASE
        WHEN b.parent_booking_id IS NULL AND b.payment_status = 'Completed'
          THEN COALESCE(b.final_amount, b.total_amount, 0)
        END), 0) AS total_revenue,

      COALESCE(SUM(CASE
        WHEN b.parent_booking_id IS NULL AND b.payment_status <> 'Completed'
          THEN COALESCE(b.final_amount, b.total_amount, 0)
        END), 0) AS pending_revenue,

      COALESCE(SUM(b.quantity) FILTER (
        WHERE b.parent_booking_id IS NULL AND b.payment_status = 'Completed'
      ), 0) AS total_people,

      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.payment_status = 'Completed'
          AND b.booking_date = CURRENT_DATE
      ) AS today_bookings,

      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.payment_status <> 'Completed'
      ) AS pending_payments,

      COUNT(DISTINCT b.user_id) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.payment_status = 'Completed'
      ) AS unique_users

    FROM bookings b
    WHERE b.booking_status <> 'Cancelled'
      AND b.booking_date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND b.booking_date <= COALESCE($2::date, CURRENT_DATE)
      AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint);
  `;
  const { rows } = await pool.query(sql, [from, to, attraction_id]);
  return rows[0];
}

// Top attractions (bookings, people, revenue) within range
async function getTopAttractions({ from = null, to = null, limit = 10, attraction_id = null } = {}) {
  const sql = `
    SELECT
      a.attraction_id,
      a.title,
      COUNT(*) FILTER (WHERE b.payment_status = 'Completed') AS bookings,
      COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN b.quantity ELSE 0 END), 0) AS people,
      COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN COALESCE(b.final_amount, b.total_amount, 0) ELSE 0 END), 0) AS revenue
    FROM bookings b
    JOIN attractions a ON a.attraction_id = b.attraction_id
    WHERE b.booking_status <> 'Cancelled'
      AND b.booking_date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND b.booking_date <= COALESCE($2::date, CURRENT_DATE)
      AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint)
    GROUP BY a.attraction_id, a.title
    ORDER BY bookings DESC, revenue DESC
    LIMIT $4;
  `;
  const { rows } = await pool.query(sql, [from, to, attraction_id, limit]);
  return rows;
}

// Combo vs offer contribution stats
async function getComboOfferStats({ from = null, to = null, attraction_id = null, combo_id = null } = {}) {
  const sql = `
    SELECT
      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.item_type = 'Combo'
          AND b.payment_status = 'Completed'
          AND ($4::bigint IS NULL OR b.combo_id = $4::bigint)
      )::int AS combo_bookings,
      COALESCE(SUM(CASE
        WHEN b.parent_booking_id IS NULL AND b.item_type = 'Combo' AND b.payment_status = 'Completed'
          AND ($4::bigint IS NULL OR b.combo_id = $4::bigint)
          THEN COALESCE(b.final_amount, b.total_amount, 0)
      END), 0) AS combo_revenue,
      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.offer_id IS NOT NULL
          AND b.payment_status = 'Completed'
      )::int AS offer_bookings,
      COALESCE(SUM(CASE
        WHEN b.parent_booking_id IS NULL AND b.offer_id IS NOT NULL AND b.payment_status = 'Completed'
          THEN COALESCE(b.final_amount, b.total_amount, 0)
      END), 0) AS offer_revenue
    FROM bookings b
    WHERE b.booking_status <> 'Cancelled'
      AND b.booking_date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND b.booking_date <= COALESCE($2::date, CURRENT_DATE)
      AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint);
  `;
  const { rows } = await pool.query(sql, [from, to, attraction_id, combo_id]);
  const stats = rows[0] || {};
  return {
    combo_bookings: Number(stats.combo_bookings || 0),
    combo_revenue: Number(stats.combo_revenue || 0),
    offer_bookings: Number(stats.offer_bookings || 0),
    offer_revenue: Number(stats.offer_revenue || 0),
  };
}

// Separate attraction revenue stats
async function getAttractionRevenueStats({ from = null, to = null, attraction_id = null } = {}) {
  const sql = `
    SELECT
      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL
          AND b.item_type = 'Attraction'
          AND b.payment_status = 'Completed'
          AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint)
      )::int AS attraction_bookings,
      COALESCE(SUM(CASE
        WHEN b.parent_booking_id IS NULL AND b.item_type = 'Attraction' AND b.payment_status = 'Completed'
          AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint)
          THEN COALESCE(b.final_amount, b.total_amount, 0)
      END), 0) AS attraction_revenue
    FROM bookings b
    WHERE b.booking_status <> 'Cancelled'
      AND b.booking_date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND b.booking_date <= COALESCE($2::date, CURRENT_DATE)
      AND b.item_type = 'Attraction';
  `;
  const { rows } = await pool.query(sql, [from, to, attraction_id]);
  const stats = rows[0] || {};
  return {
    attraction_bookings: Number(stats.attraction_bookings || 0),
    attraction_revenue: Number(stats.attraction_revenue || 0),
  };
}

// Sales trend (bookings, people, revenue) by granularity
async function getSalesTrend({ from = null, to = null, granularity = 'day', attraction_id = null } = {}) {
  const g = sanitizeGranularity(granularity);
  const sql = `
    SELECT
      date_trunc('${g}', b.booking_date) AS bucket,
      COUNT(*) FILTER (
        WHERE b.parent_booking_id IS NULL AND b.payment_status = 'Completed'
      ) AS bookings,
      COALESCE(SUM(b.quantity) FILTER (
        WHERE b.parent_booking_id IS NULL AND b.payment_status = 'Completed'
      ), 0) AS people,
      COALESCE(SUM(CASE
        WHEN b.parent_booking_id IS NULL AND b.payment_status = 'Completed'
          THEN COALESCE(b.final_amount, b.total_amount, 0)
      END), 0) AS revenue
    FROM bookings b
    WHERE b.booking_status <> 'Cancelled'
      AND b.booking_date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND b.booking_date <= COALESCE($2::date, CURRENT_DATE)
      AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint)
    GROUP BY bucket
    ORDER BY bucket ASC;
  `;
  const { rows } = await pool.query(sql, [from, to, attraction_id]);
  return rows;
}

// Latest bookings for admin dashboard
async function getRecentBookings({ limit = 20, offset = 0, attraction_id = null } = {}) {
  const sql = `
    SELECT
      b.booking_id, b.booking_ref, b.user_id, b.attraction_id, b.slot_id,
      b.final_amount, b.payment_status, b.payment_mode, b.booking_status,
      b.created_at,
      u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
      a.title AS attraction_title
    FROM bookings b
    LEFT JOIN users u ON u.user_id = b.user_id
    LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
    WHERE ($1::bigint IS NULL OR b.attraction_id = $1::bigint)
    ORDER BY b.created_at DESC
    LIMIT $2 OFFSET $3;
  `;
  const { rows } = await pool.query(sql, [attraction_id, limit, offset]);
  return rows;
}

// Count bookings by status
async function getBookingCountsByStatus({ from = null, to = null, attraction_id = null } = {}) {
  const sql = `
    SELECT b.booking_status, COUNT(*)::int AS count
    FROM bookings b
    WHERE b.booking_date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND b.booking_date <= COALESCE($2::date, CURRENT_DATE)
      AND ($3::bigint IS NULL OR b.attraction_id = $3::bigint)
      AND b.parent_booking_id IS NULL
    GROUP BY b.booking_status
    ORDER BY b.booking_status;
  `;
  const { rows } = await pool.query(sql, [from, to, attraction_id]);
  return rows;
}

// List admins/subadmins with roles
async function listAdmins({ search = '', role = null, limit = 20, offset = 0 } = {}) {
  const params = [];
  let idx = 1;

  let where = `LOWER(r.role_name) = ANY($${idx}::text[])`;
  params.push(ADMIN_ROLES.map((r) => r.toLowerCase()));
  idx += 1;

  if (role) {
    where += ` AND LOWER(r.role_name) = $${idx}`;
    params.push(String(role).toLowerCase());
    idx += 1;
  }

  if (search) {
    where += ` AND (u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx += 1;
  }

  const sql = `
    SELECT
      u.user_id, u.name, u.email, u.phone, u.created_at,
      ARRAY_AGG(DISTINCT r.role_name) AS roles
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.user_id
    JOIN roles r ON r.role_id = ur.role_id
    WHERE ${where}
    GROUP BY u.user_id
    ORDER BY u.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1};
  `;
  params.push(limit, offset);

  const { rows } = await pool.query(sql, params);
  return rows;
}

// Ensure a role exists, return role_id (UPSERT-safe)
async function ensureRole(roleName) {
  const name = String(roleName).toLowerCase();
  const sql = `
    INSERT INTO roles (role_name, description)
    VALUES ($1, $2)
    ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description
    RETURNING role_id;
  `;
  const { rows } = await pool.query(sql, [name, `${name} role`]);
  return rows[0].role_id;
}

// Assign role to user (idempotent)
async function assignRoleByName(userId, roleName) {
  const roleId = await ensureRole(roleName);
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId]
  );
  return { userId, roleId, assigned: true };
}

// Revoke role from user
async function revokeRoleByName(userId, roleName) {
  const name = String(roleName).toLowerCase();
  const sql = `
    DELETE FROM user_roles
    WHERE user_id = $1 AND role_id IN (
      SELECT role_id FROM roles WHERE LOWER(role_name) = $2
    )
    RETURNING user_id;
  `;
  const { rowCount } = await pool.query(sql, [userId, name]);
  return { userId, revoked: rowCount > 0 };
}

// Get all permissions for a user (via roles)
async function getUserPermissions(userId) {
  const sql = `
    SELECT DISTINCT LOWER(p.permission_key) AS permission_key
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.permission_id = rp.permission_id
    WHERE ur.user_id = $1
    ORDER BY permission_key;
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows.map((r) => r.permission_key);
}

// Admin overview: combine summary + breakdown + top + trend
async function getAdminOverview({ from = null, to = null, attraction_id = null, combo_id = null } = {}) {
  const [summary, statusBreakdown, topAttractions, trend, comboOffers, attractionStats] = await Promise.all([
    getDashboardSummary({ from, to, attraction_id }),
    getBookingCountsByStatus({ from, to, attraction_id }),
    getTopAttractions({ from, to, limit: 5, attraction_id }),
    getSalesTrend({ from, to, granularity: 'day', attraction_id }),
    getComboOfferStats({ from, to, attraction_id, combo_id }),
    getAttractionRevenueStats({ from, to, attraction_id }),
  ]);

  return { summary: { ...summary, ...comboOffers, ...attractionStats }, statusBreakdown, topAttractions, trend };
}

// Attractions-wise breakdown within range
async function getAttractionBreakdown({ from = null, to = null, limit = 50 } = {}) {
  const sql = `
    SELECT
      a.attraction_id,
      a.title,
      COUNT(*) FILTER (WHERE b.payment_status = 'Completed') AS bookings,
      COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN b.quantity ELSE 0 END), 0) AS people,
      COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN COALESCE(b.final_amount, b.total_amount, 0) ELSE 0 END), 0) AS revenue
    FROM bookings b
    JOIN attractions a ON a.attraction_id = b.attraction_id
    WHERE b.booking_status <> 'Cancelled'
      AND b.created_at >= COALESCE($1::timestamptz, NOW() - INTERVAL '30 days')
      AND b.created_at <  COALESCE($2::timestamptz, NOW())
    GROUP BY a.attraction_id, a.title
    ORDER BY bookings DESC, revenue DESC
    LIMIT $3;
  `;
  const { rows } = await pool.query(sql, [from, to, limit]);
  return rows;
}

// Generic split (by payment_status | booking_status | payment_mode)
async function getSplitData({ from = null, to = null, group_by = 'payment_status' } = {}) {
  const allowed = new Set(['payment_status', 'booking_status', 'payment_mode']);
  const col = allowed.has(String(group_by)) ? group_by : 'payment_status';
  const sql = `
    SELECT ${col} AS key,
           COUNT(*)::int AS bookings,
           COALESCE(SUM(b.quantity), 0)::int AS people,
           COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN COALESCE(b.final_amount, b.total_amount, 0) ELSE 0 END), 0) AS revenue
    FROM bookings b
    WHERE b.created_at >= COALESCE($1::timestamptz, NOW() - INTERVAL '30 days')
      AND b.created_at <  COALESCE($2::timestamptz, NOW())
      AND b.booking_status <> 'Cancelled'
      AND b.parent_booking_id IS NULL
    GROUP BY ${col}
    ORDER BY bookings DESC;
  `;
  const { rows } = await pool.query(sql, [from, to]);
  return rows;
}

// Detailed daily analytics with attraction/combo breakdown, slots, hours, offers
async function getDetailedDailyAnalytics({ from = null, to = null, attraction_id = null, combo_id = null, user_scopes = {} } = {}) {
  // Apply role-based scoping
  const attractionScope = user_scopes.attraction || [];
  const comboScope = user_scopes.combo || [];

  // Build WHERE conditions for scoping
  let scopeWhere = '';
  let scopeParams = [];
  let paramIndex = 1;

  if (!attractionScope.includes('*') && attractionScope.length > 0) {
    scopeWhere += ` AND b.attraction_id = ANY($${paramIndex}::bigint[])`;
    scopeParams.push(attractionScope);
    paramIndex++;
  }

  if (!comboScope.includes('*') && comboScope.length > 0) {
    scopeWhere += ` AND b.combo_id = ANY($${paramIndex}::bigint[])`;
    scopeParams.push(comboScope);
    paramIndex++;
  }

  // If specific attraction/combo requested, add filters
  if (attraction_id) {
    scopeWhere += ` AND b.attraction_id = $${paramIndex}`;
    scopeParams.push(attraction_id);
    paramIndex++;
  }

  if (combo_id) {
    scopeWhere += ` AND b.combo_id = $${paramIndex}`;
    scopeParams.push(combo_id);
    paramIndex++;
  }

  const dateWhere = `b.booking_date >= COALESCE($${paramIndex}::date, CURRENT_DATE - INTERVAL '30 days')
                     AND b.booking_date <= COALESCE($${paramIndex + 1}::date, CURRENT_DATE)`;
  scopeParams.push(from, to);

  // Check if we need detailed slot/hour data (when specific attraction/combo is selected)
  const needsDetailedData = attraction_id || combo_id;

  let dailyData, slotHourData;

  if (needsDetailedData) {
    // Get detailed slot-wise and hour-wise data
    const detailedSql = `
      SELECT
        s.start_date AS booking_date,
        CASE
          WHEN b.attraction_id IS NOT NULL THEN 'attraction'
          ELSE 'combo'
        END AS type,
        COALESCE(a.title, c.name) AS name,
        COALESCE(a.base_price, c.combo_price) AS base_price,
        COALESCE(b.attraction_id, b.combo_id) AS id,
        s.start_time,
        s.end_time,
        EXTRACT(HOUR FROM s.start_time) AS hour,
        COUNT(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN 1 END) AS completed_bookings,
        COUNT(CASE WHEN b.payment_status <> 'Completed' AND b.parent_booking_id IS NULL THEN 1 END) AS pending_bookings,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN b.quantity END), 0) AS total_people,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN COALESCE(b.final_amount, b.total_amount, 0) END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN b.payment_status <> 'Completed' AND b.parent_booking_id IS NULL THEN COALESCE(b.final_amount, b.total_amount, 0) END), 0) AS pending_revenue,
        COUNT(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL AND b.offer_id IS NOT NULL THEN 1 END) AS bookings_with_offers,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL AND b.offer_id IS NOT NULL THEN (COALESCE(b.total_amount, 0) - COALESCE(b.final_amount, 0)) END), 0) AS total_discounts,
        -- Slot availability
        COUNT(CASE WHEN s.available = true THEN 1 END) AS available_slots,
        COUNT(CASE WHEN s.available = false THEN 1 END) AS booked_slots,
        COUNT(*) AS total_slots
      FROM attraction_slots s
      LEFT JOIN bookings b ON b.slot_id = s.slot_id AND b.booking_status <> 'Cancelled'
      LEFT JOIN attractions a ON s.attraction_id = a.attraction_id
      LEFT JOIN combos c ON s.combo_id = c.combo_id
      WHERE s.start_date >= COALESCE($${paramIndex}::date, CURRENT_DATE - INTERVAL '30 days')
        AND s.start_date <= COALESCE($${paramIndex + 1}::date, CURRENT_DATE)
        ${scopeWhere.replace(/b\./g, 's.')}
      GROUP BY s.start_date, s.start_time, s.end_time, s.attraction_id, s.combo_id, a.title, a.base_price, c.name, c.combo_price
      ORDER BY s.start_date DESC, s.start_time ASC;
    `;

    const { rows } = await pool.query(detailedSql, scopeParams);
    slotHourData = rows;

    // Aggregate daily totals from slot data
    const dailyMap = new Map();
    rows.forEach(row => {
      const key = `${row.booking_date}-${row.type}-${row.id}`;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          booking_date: row.booking_date,
          type: row.type,
          name: row.name,
          id: row.id,
          base_price: row.base_price,
          completed_bookings: 0,
          pending_bookings: 0,
          total_bookings: 0,
          total_people: 0,
          revenue: 0,
          pending_revenue: 0,
          unique_customers: 0,
          avg_booking_value: 0,
          slots_used: 0,
          hours_booked: 0,
          bookings_with_offers: 0,
          total_discounts: 0,
          slot_hour_data: []
        });
      }
      const daily = dailyMap.get(key);
      daily.completed_bookings += Number(row.completed_bookings || 0);
      daily.pending_bookings += Number(row.pending_bookings || 0);
      daily.total_bookings += Number(row.completed_bookings || 0) + Number(row.pending_bookings || 0);
      daily.total_people += Number(row.total_people || 0);
      daily.revenue += Number(row.revenue || 0);
      daily.pending_revenue += Number(row.pending_revenue || 0);
      daily.bookings_with_offers += Number(row.bookings_with_offers || 0);
      daily.total_discounts += Number(row.total_discounts || 0);
      daily.slots_used += Number(row.completed_bookings > 0 ? 1 : 0);
      daily.hours_booked += Number(row.completed_bookings > 0 && row.start_time && row.end_time ?
        (new Date(`1970-01-01T${row.end_time}`) - new Date(`1970-01-01T${row.start_time}`)) / (1000 * 60 * 60) : 0);

      // Add slot/hour data
      daily.slot_hour_data.push({
        hour: row.hour,
        start_time: row.start_time,
        end_time: row.end_time,
        completed_bookings: row.completed_bookings,
        pending_bookings: row.pending_bookings,
        total_people: row.total_people,
        revenue: row.revenue,
        pending_revenue: row.pending_revenue,
        bookings_with_offers: row.bookings_with_offers,
        total_discounts: row.total_discounts,
        available_slots: row.available_slots,
        booked_slots: row.booked_slots,
        total_slots: row.total_slots,
        potential_revenue: (row.total_slots || 0) * (row.base_price || 0),
        actual_revenue: row.revenue,
        lost_to_offers: row.total_discounts
      });
    });

    dailyData = Array.from(dailyMap.values()).map(daily => ({
      ...daily,
      avg_booking_value: daily.completed_bookings > 0 ? daily.revenue / daily.completed_bookings : 0
    }));

  } else {
    // Original daily aggregate query for overview
    const sql = `
      SELECT
        b.booking_date,
        CASE
          WHEN b.attraction_id IS NOT NULL THEN 'attraction'
          ELSE 'combo'
        END AS type,
        COALESCE(a.title, c.name) AS name,
        COALESCE(b.attraction_id, b.combo_id) AS id,
        COUNT(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN 1 END) AS completed_bookings,
        COUNT(CASE WHEN b.payment_status <> 'Completed' AND b.parent_booking_id IS NULL THEN 1 END) AS pending_bookings,
        COUNT(CASE WHEN b.parent_booking_id IS NULL THEN 1 END) AS total_bookings,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN b.quantity END), 0) AS total_people,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN COALESCE(b.final_amount, b.total_amount, 0) END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN b.payment_status <> 'Completed' AND b.parent_booking_id IS NULL THEN COALESCE(b.final_amount, b.total_amount, 0) END), 0) AS pending_revenue,
        COUNT(DISTINCT CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN b.user_id END) AS unique_customers,
        AVG(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN COALESCE(b.final_amount, b.total_amount, 0) END) AS avg_booking_value,
        COUNT(DISTINCT CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN s.slot_id END) AS slots_used,
        SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL THEN EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600 END) AS hours_booked,
        COUNT(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL AND b.offer_id IS NOT NULL THEN 1 END) AS bookings_with_offers,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' AND b.parent_booking_id IS NULL AND b.offer_id IS NOT NULL THEN (COALESCE(b.total_amount, 0) - COALESCE(b.final_amount, 0)) END), 0) AS total_discounts
      FROM bookings b
      LEFT JOIN attractions a ON b.attraction_id = a.attraction_id
      LEFT JOIN combos c ON b.combo_id = c.combo_id
      LEFT JOIN attraction_slots s ON b.slot_id = s.slot_id
      WHERE ${dateWhere}${scopeWhere}
        AND b.booking_status <> 'Cancelled'
      GROUP BY b.booking_date, b.attraction_id, b.combo_id, a.title, c.name
      ORDER BY b.booking_date DESC, revenue DESC;
    `;

    const { rows } = await pool.query(sql, scopeParams);
    dailyData = rows;
  }

  try {
    return dailyData;

  } catch (error) {
    console.error('Error in getDetailedDailyAnalytics:', error);
    throw error;
  }
}

module.exports = {
  sanitizeGranularity,
  getDashboardSummary,
  getTopAttractions,
  getSalesTrend,
  getRecentBookings,
  getBookingCountsByStatus,
  getComboOfferStats,
  getAttractionRevenueStats,
  listAdmins,
  ensureRole,
  assignRoleByName,
  revokeRoleByName,
  getUserPermissions,
  getAdminOverview,
  getAttractionBreakdown,
  getSplitData,
  getDetailedDailyAnalytics,
};