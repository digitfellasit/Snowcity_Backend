// models/bookings.model.js
const { pool, withTransaction } = require('../config/db');

// ---------- Row mapper (Bookings) ----------
function mapBooking(row) {
  if (!row) return null;
  return {
    booking_id: row.booking_id,
    booking_ref: row.booking_ref,
    order_id: row.order_id || null, // Link to parent order
    order_ref: row.parent_order_ref || null, // EXPLICIT real order_ref
    parent_booking_id: row.parent_booking_id || null,
    user_id: row.user_id,

    // Product refs
    item_type: row.item_type || 'Attraction', // 'Attraction' | 'Combo'
    attraction_id: row.attraction_id || null,
    combo_id: row.combo_id || null,
    offer_id: row.offer_id || null,

    // Slot refs
    slot_id: row.slot_id || null,
    combo_slot_id: row.combo_slot_id || null,

    // Counts & timing
    quantity: row.quantity,
    booking_date: row.booking_date,
    booking_time: row.booking_time,

    // Money
    total_amount: row.total_amount,
    discount_amount: row.discount_amount,
    final_amount: row.final_amount,

    // Status (Now primarily derived from Order, but kept on row for legacy)
    payment_status: row.payment_status,
    booking_status: row.booking_status,

    // Artifacts
    ticket_status: row.ticket_status || 'NOT_REDEEMED',
    ticket_pdf: row.ticket_pdf,
    whatsapp_sent: row.whatsapp_sent,
    email_sent: row.email_sent,

    // Titles
    attraction_title: row.attraction_title || null,
    combo_title: row.combo_title || row.combo_name || null,
    item_title: row.item_title || row.attraction_title || row.combo_title || null,

    slot_start_time: row.slot_start_time || null,
    slot_end_time: row.slot_end_time || null,
    time_slot_enabled: row.item_type === 'Combo' ? Boolean(row.create_slots) : Boolean(row.time_slot_enabled),

    // Offer details
    offer: row.offer_id ? {
      offer_id: row.offer_id,
      title: row.offer_title,
      description: row.offer_description,
      rule_type: row.offer_rule_type,
      discount_type: row.offer_discount_type,
      discount_value: row.offer_discount_value,
      discount_percent: row.offer_discount_percent,
      max_discount: row.offer_max_discount,
      // Buy X Get Y details
      buy_qty: row.offer_buy_qty,
      get_qty: row.offer_get_qty,
      get_target_type: row.offer_get_target_type,
      get_target_id: row.offer_get_target_id,
      get_discount_type: row.offer_get_discount_type,
      get_discount_value: row.offer_get_discount_value
    } : null,

    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// ---------- Row mapper (Orders) ----------
function mapOrder(row) {
  if (!row) return null;
  return {
    order_id: row.order_id,
    order_ref: row.order_ref,
    user_id: row.user_id,
    total_amount: row.total_amount,
    discount_amount: row.discount_amount,
    final_amount: row.final_amount,
    payment_status: row.payment_status,
    payment_mode: row.payment_mode,
    payment_ref: row.payment_ref,
    payment_txn_no: row.payment_txn_no,
    payment_method: row.payment_method || null,
    payment_datetime: row.payment_datetime || null,
    created_at: row.created_at,
    // We might attach items here later manually
    items: []
  };
}

// ---------- Schema capabilities ----------
// Adjusted to assume the new schema exists based on your SQL script
async function getBaseSqlParts() {
  const select = `
        b.*,
        a.title AS attraction_title,
        c.combo_id,
        -- Logic to get combo title
        COALESCE(
            c.name,
            NULLIF(CONCAT_WS(' + ', NULLIF(a1c.title, ''), NULLIF(a2c.title, '')), ''),
            CONCAT('Combo #', c.combo_id::text)
        ) AS combo_title,
        
        -- Normalized Item Title
        CASE 
            WHEN b.item_type = 'Combo' THEN 
                COALESCE(c.name, NULLIF(CONCAT_WS(' + ', NULLIF(a1c.title, ''), NULLIF(a2c.title, '')), ''), CONCAT('Combo #', c.combo_id::text))
            ELSE a.title 
        END AS item_title,

        -- Slot times (use actual slot timing columns from database)
        b.slot_start_time,
        b.slot_end_time,
        b.slot_label,
        
        -- Offer details
        o.offer_id,
        o.title AS offer_title,
        o.description AS offer_description,
        o.rule_type AS offer_rule_type,
        o.discount_type AS offer_discount_type,
        o.discount_value AS offer_discount_value,
        o.discount_value AS offer_discount_percent,
        o.max_discount AS offer_max_discount,
        
        -- Buy X Get Y offer details
        CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.buy_qty ELSE NULL END AS offer_buy_qty,
        CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_qty ELSE NULL END AS offer_get_qty,
        CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_target_type ELSE NULL END AS offer_get_target_type,
        CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_target_id ELSE NULL END AS offer_get_target_id,
        CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_discount_type ELSE NULL END AS offer_get_discount_type,
        CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_discount_value ELSE NULL END AS offer_get_discount_value,

        a.time_slot_enabled,
        c.create_slots,
        -- Force pulling the true parent order ref
        ord.order_ref AS parent_order_ref
    `;

  const joins = `
        LEFT JOIN orders ord          ON ord.order_id      = b.order_id
        LEFT JOIN attractions a       ON a.attraction_id   = b.attraction_id
        LEFT JOIN combos      c       ON c.combo_id        = b.combo_id
        LEFT JOIN attractions a1c     ON a1c.attraction_id = c.attraction_1_id
        LEFT JOIN attractions a2c     ON a2c.attraction_id = c.attraction_2_id
        LEFT JOIN offers o            ON o.offer_id        = b.offer_id
        LEFT JOIN offer_rules orr     ON orr.offer_id      = o.offer_id AND orr.rule_id = (
            SELECT MIN(rule_id) FROM offer_rules WHERE offer_id = o.offer_id
        )
    `;

  return { select, joins };
}

// ---------- READ Operations ----------

async function getBookingById(booking_id) {
  const { select, joins } = await getBaseSqlParts();
  const isRef = typeof booking_id === 'string' && !/^\d+$/.test(booking_id);
  const field = isRef ? 'b.booking_ref' : 'b.booking_id';
  const { rows } = await pool.query(`SELECT ${select} FROM bookings b ${joins} WHERE ${field} = $1`, [booking_id]);
  return mapBooking(rows[0]);
}

// Get full Order details (The "Receipt" view)
async function getOrderWithDetails(order_id) {
  // 1. Get Order
  const isRef = typeof order_id === 'string' && !/^\d+$/.test(order_id);
  const field = isRef ? 'order_ref' : 'order_id';
  const orderRes = await pool.query(`SELECT * FROM orders WHERE ${field} = $1`, [order_id]);
  if (!orderRes.rows.length) return null;
  const order = mapOrder(orderRes.rows[0]);

  // 2. Get Bookings (Items)
  const { select, joins } = await getBaseSqlParts();
  const bookingRes = await pool.query(
    `SELECT ${select} FROM bookings b ${joins} WHERE b.order_id = $1 ORDER BY b.created_at ASC`,
    [order.order_id]
  );

  // 3. Get Addons for each booking
  const bookings = [];
  for (const bookingRow of bookingRes.rows) {
    const booking = mapBooking(bookingRow);

    // Fetch addons for this booking
    const addons = await pool.query(
      `SELECT ba.*, ad.title AS addon_title, ad.description AS addon_description
         FROM booking_addons ba
         JOIN addons ad ON ad.addon_id = ba.addon_id
         WHERE ba.booking_id = $1
         ORDER BY ad.title ASC`,
      [booking.booking_id]
    );

    booking.addons = addons.rows.map(addon => ({
      booking_addon_id: addon.booking_addon_id,
      addon_id: addon.addon_id,
      quantity: addon.quantity,
      price: addon.price,
      title: addon.addon_title,
      description: addon.addon_description
    }));

    bookings.push(booking);
  }

  order.items = bookings;
  return order;
}

// List bookings (Legacy support + My Bookings individual rows)
async function listBookings({
  user_id = null,
  order_id = null,
  limit = 20,
  offset = 0
} = {}) {
  const { select, joins } = await getBaseSqlParts();
  const where = [];
  const params = [];
  let i = 1;

  if (user_id) { where.push(`b.user_id = $${i++}`); params.push(user_id); }
  if (order_id) { where.push(`b.order_id = $${i++}`); params.push(order_id); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ${select} FROM bookings b ${joins} ${whereSql} ORDER BY b.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );

  // Get addons for each booking
  const bookings = [];
  for (const bookingRow of rows) {
    const booking = mapBooking(bookingRow);

    // Fetch addons for this booking
    const addons = await pool.query(
      `SELECT ba.*, ad.title AS addon_title, ad.description AS addon_description
       FROM booking_addons ba
       JOIN addons ad ON ad.addon_id = ba.addon_id
       WHERE ba.booking_id = $1
       ORDER BY ad.title ASC`,
      [booking.booking_id]
    );

    booking.addons = addons.rows.map(addon => ({
      booking_addon_id: addon.booking_addon_id,
      addon_id: addon.addon_id,
      quantity: addon.quantity,
      price: addon.price,
      title: addon.addon_title,
      description: addon.addon_description
    }));

    bookings.push(booking);
  }

  return bookings;
}

// ---------- WRITE Operations (Transactional Multi-Item) ----------

/**
 * Creates a Parent Order and Multiple Child Bookings (with Addons)
 * This solves the "Multiple items pay at single time" requirement.
 */
async function createOrderWithItems(orderPayload, items = []) {
  return withTransaction(async (client) => {
    // 1. Create Parent Order
    const {
      user_id,
      total_amount,
      discount_amount = 0,
      payment_mode = 'Online',
      coupon_code = null
    } = orderPayload;

    const orderRes = await client.query(
      `INSERT INTO orders 
       (user_id, total_amount, discount_amount, payment_mode, coupon_code, payment_status)
       VALUES ($1, $2, $3, $4, $5, 'Pending')
       RETURNING *`,
      [user_id, total_amount, discount_amount, payment_mode, coupon_code]
    );
    const order = orderRes.rows[0];
    const orderId = order.order_id;

    const createdBookings = [];

    // 2. Create Child Bookings
    for (const item of items) {
      // FIX: Strict check to prevent "violates check constraint"
      // If Combo, attraction_id MUST be null. If Attraction, combo_id MUST be null.
      const isCombo = item.item_type === 'Combo' || (item.combo_id && !item.attraction_id);

      const item_type = isCombo ? 'Combo' : 'Attraction';
      const attraction_id = isCombo ? null : (item.attraction_id || null);
      const combo_id = isCombo ? (item.combo_id || null) : null;
      const slot_id = isCombo ? null : (item.slot_id || null);
      const combo_slot_id = isCombo ? (item.combo_slot_id || null) : null;

      // Hardcoded temporary fix: Disable same-day booking for combo 26
      if (isCombo && String(combo_id) === '26') {
        const today = new Date().toISOString().split('T')[0];
        const bookingDate = new Date(item.booking_date).toISOString().split('T')[0];
        if (bookingDate === today) {
          throw new Error('Same-day booking is not allowed for the Snow Park + Eyelusion combo.');
        }
      }

      // Calculate item specific totals (simple logic, can be expanded)
      // Assuming the frontend/controller calculated the unit price * qty = total_amount for this line item
      const itemTotal = item.total_amount || 0;

      const bookingRes = await client.query(
        `INSERT INTO bookings 
             (order_id, user_id, item_type, attraction_id, combo_id, slot_id, combo_slot_id, 
              offer_id, quantity, booking_date, total_amount, payment_status)
             VALUES 
             ($1, $2, $3::booking_item_type, $4, $5, $6, $7, 
              $8, $9, $10, $11, 'Pending')
             RETURNING *`,
        [
          orderId,
          user_id,
          item_type,
          attraction_id,
          combo_id,
          slot_id,
          combo_slot_id,
          item.offer_id || null,
          item.quantity || 1,
          item.booking_date || new Date(),
          itemTotal
        ]
      );

      const booking = bookingRes.rows[0];

      // 3. Insert Addons for this booking
      if (item.addons && Array.isArray(item.addons) && item.addons.length > 0) {
        for (const addon of item.addons) {
          await client.query(
            `INSERT INTO booking_addons (booking_id, addon_id, quantity, price)
                     VALUES ($1, $2, $3, $4)`,
            // Assuming price lookup happens in controller or passed from FE, 
            // ideally should be looked up from DB here for security
            [booking.booking_id, addon.addon_id, addon.quantity, addon.price || 0]
          );
        }
      }

      createdBookings.push(booking);
    }

    return { order, bookings: createdBookings };
  });
}

// ---------- Legacy Single Create (Adapted) ----------
async function createBooking(fields = {}, { client: extClient } = {}) {
  // If this is called directly, we create a "wrapper" order implicitly 
  // or insert nullable order_id if DB allows (but DB usually requires order_id now).
  // For backward compatibility, we wrap it in a transaction and create an Order first.

  const runner = extClient || pool;

  // 1. Normalize Input
  const isCombo = fields.item_type === 'Combo' || (fields.combo_id && !fields.attraction_id);
  const item_type = isCombo ? 'Combo' : 'Attraction';
  const attraction_id = isCombo ? null : fields.attraction_id;
  const combo_id = isCombo ? fields.combo_id : null;

  // Handle virtual slot IDs for dynamic slots
  let slot_id = isCombo ? null : fields.slot_id;
  let combo_slot_id = isCombo ? fields.combo_slot_id : null;
  // Keep booking_time as the actual booking timestamp (when booking was made)
  let booking_time = fields.booking_time || new Date().toTimeString().split(' ')[0];

  // Set default slot timing from fields if provided
  let slot_start_time = fields.slot_start_time;
  let slot_end_time = fields.slot_end_time;

  console.log('🔍 DEBUG booking model input (ATTRACTION):', {
    fields,
    slot_id,
    combo_slot_id,
    booking_time,
    slot_start_time,
    slot_end_time,
    isCombo
  });

  // Ensure booking_time is set to current timestamp if not provided
  if (!booking_time || booking_time === '') {
    booking_time = new Date().toTimeString().split(' ')[0];
  }

  // If virtual slot ID is provided (format: attraction_id-date-hour), extract the time
  // BUT only if slot timing is not already provided from frontend
  if (isCombo && String(combo_id) === '26') {
    const today = new Date().toISOString().split('T')[0];
    const bookingDate = new Date(fields.booking_date).toISOString().split('T')[0];
    if (bookingDate === today) {
      throw new Error('Same-day booking is not allowed for the Snow Park + Eyelusion combo.');
    }
  }

  if (slot_id && typeof slot_id === 'string' && slot_id.includes('-')) {
    console.log('🔍 DEBUG parsing attraction virtual slot ID:', slot_id);
    const parts = slot_id.split('-');
    // Format: attraction_id-date-hour (e.g., 1-20251129-14)
    const hour = parseInt(parts[2]); // Get the hour part (index 2)
    const parsed_booking_time = `${String(hour).padStart(2, '0')}:00:00`;
    const parsed_start_time = parsed_booking_time;
    const parsed_end_time = `${String((hour + 1) % 24).padStart(2, '0')}:00:00`;

    console.log('🔍 DEBUG attraction slot parsing:', {
      slot_id_parts: parts,
      hour,
      parsed_booking_time,
      parsed_start_time,
      parsed_end_time,
      frontend_provided_start: slot_start_time,
      frontend_provided_end: slot_end_time,
      current_booking_time: booking_time
    });

    // IMPORTANT: Use parsed slot times but keep booking_time as actual timestamp
    slot_start_time = parsed_start_time;
    slot_end_time = parsed_end_time;
    // booking_time remains as the actual booking timestamp

    console.log('🔍 DEBUG FORCED slot timing (overriding booking_time):', {
      booking_time,
      slot_start_time,
      slot_end_time
    });

    slot_id = null; // Don't store virtual slot ID in database

    console.log('🔍 DEBUG final attraction slot timing:', {
      booking_time,
      slot_start_time,
      slot_end_time
    });
  }

  if (combo_slot_id && typeof combo_slot_id === 'string' && combo_slot_id.includes('-')) {
    console.log('🔍 DEBUG parsing combo virtual slot ID:', combo_slot_id);
    const parts = combo_slot_id.split('-');
    // Format: combo_id-date-hour (e.g., 2-20251129-16)
    const hour = parseInt(parts[2]); // Get the hour part (index 2)
    const parsed_booking_time = `${String(hour).padStart(2, '0')}:00:00`;
    const parsed_start_time = parsed_booking_time;
    const parsed_end_time = `${String((hour + 2) % 24).padStart(2, '0')}:00:00`;

    console.log('🔍 DEBUG combo slot parsing:', {
      combo_slot_id_parts: parts,
      hour,
      parsed_booking_time,
      parsed_start_time,
      parsed_end_time,
      frontend_provided_start: slot_start_time,
      frontend_provided_end: slot_end_time,
      current_booking_time: booking_time
    });

    // IMPORTANT: Use parsed slot times but keep booking_time as actual timestamp
    slot_start_time = parsed_start_time;
    slot_end_time = parsed_end_time;
    // booking_time remains as the actual booking timestamp

    console.log('🔍 DEBUG FORCED combo slot timing (overriding booking_time):', {
      booking_time,
      slot_start_time,
      slot_end_time
    });

    combo_slot_id = null; // Don't store virtual slot ID in database

    console.log('🔍 DEBUG parsed combo slot:', {
      hour,
      booking_time,
      slot_start_time,
      slot_end_time
    });
  }

  console.log('🔍 DEBUG final booking times (ATTRACTION):', {
    booking_time,
    slot_start_time,
    slot_end_time
  });

  // Set slot_label if we have slot_start_time and slot_end_time but no slot_label
  if (slot_start_time && slot_end_time && !fields.slot_label) {
    const startHour = parseInt(slot_start_time.split(':')[0]);
    const startMin = slot_start_time.split(':')[1];
    const endHour = parseInt(slot_end_time.split(':')[0]);
    const endMin = slot_end_time.split(':')[1];

    // Convert to 12-hour format
    const formatTime = (hour, min) => {
      const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      return `${displayHour}:${min} ${ampm}`;
    };

    fields.slot_label = `${formatTime(startHour, startMin)} - ${formatTime(endHour, endMin)}`;
    console.log('🔍 DEBUG auto-generated slot_label:', fields.slot_label);
  }

  // 2. Insert
  // Note: If your schema requires order_id NOT NULL, this function needs to create an order first.
  // Assuming strict schema from your update:

  if (!fields.order_id) {
    // Auto-create wrapper order
    const ord = await runner.query(
      `INSERT INTO orders (user_id, total_amount, payment_status) VALUES ($1, $2, 'Pending') RETURNING order_id`,
      [fields.user_id, fields.total_amount]
    );
    fields.order_id = ord.rows[0].order_id;
  }

  const res = await runner.query(
    `INSERT INTO bookings 
      (order_id, user_id, item_type, attraction_id, combo_id, slot_id, combo_slot_id, quantity, booking_date, booking_time, total_amount, payment_status, slot_start_time, slot_end_time, slot_label)
     VALUES ($1, $2, $3::booking_item_type, $4, $5, $6, $7, $8, $9, $10, $11, 'Pending', $12, $13, $14)
     RETURNING *`,
    [
      fields.order_id,
      fields.user_id,
      item_type,
      attraction_id,
      combo_id,
      slot_id,
      combo_slot_id,
      fields.quantity,
      fields.booking_date,
      booking_time,
      fields.total_amount,
      slot_start_time,
      slot_end_time,
      fields.slot_label
    ]
  );

  return mapBooking(res.rows[0]);
}

// ---------- Updates ----------

async function updatePaymentStatus(order_id, status, ref = null) {
  return withTransaction(async (client) => {
    // 1. Update Order
    const orderRes = await client.query(
      `UPDATE orders SET payment_status = $1, payment_ref = COALESCE($2, payment_ref), updated_at = NOW() 
             WHERE order_id = $3 RETURNING *`,
      [status, ref, order_id]
    );

    // 2. Propagate to Bookings (for easier querying)
    await client.query(
      `UPDATE bookings SET payment_status = $1, payment_ref = COALESCE($2, payment_ref), updated_at = NOW() 
             WHERE order_id = $3`,
      [status, ref, order_id]
    );

    return orderRes.rows[0];
  });
}

async function cancelOrder(order_id) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE orders SET payment_status = 'Failed', updated_at = NOW() WHERE order_id = $1 RETURNING *`,
      [order_id]
    );
    await client.query(
      `UPDATE bookings SET booking_status = 'Cancelled', updated_at = NOW() WHERE order_id = $1`,
      [order_id]
    );
    return res.rows[0];
  });
}

async function updateBooking(booking_id, updates = {}, { client } = {}) {
  if (!booking_id || typeof updates !== 'object' || updates === null) return null;

  const allowedFields = [
    'user_id',
    'attraction_id',
    'combo_id',
    'slot_id',
    'combo_slot_id',
    'booking_date',
    'booking_time',
    'slot_start_time',
    'slot_end_time',
    'slot_label',
    'quantity',
    'total_amount',
    'discount_amount',
    'final_amount',
    'payment_status',
    'payment_mode',
    'payment_ref',
    'booking_status',
    'ticket_status',
    'ticket_pdf',
    'whatsapp_sent',
    'email_sent',
    'payment_method',
    'payment_datetime',
    'payment_txn_no',
  ];

  const entries = allowedFields
    .map((field) => [field, updates[field]])
    .filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return getBookingById(booking_id);
  }

  const setFragments = [];
  const params = [];
  let index = 1;
  for (const [field, value] of entries) {
    setFragments.push(`${field} = $${index++}`);
    params.push(value);
  }

  const sql = `UPDATE bookings SET ${setFragments.join(', ')}, updated_at = NOW() WHERE booking_id = $${index} RETURNING *`;
  params.push(booking_id);

  const runner = client || pool;
  const { rows } = await runner.query(sql, params);
  return mapBooking(rows[0]);
}

async function setPayment(booking_id, { payment_status, payment_ref = null, payment_txn_no = undefined }, { client } = {}) {
  const payload = { payment_status, payment_ref };
  if (payment_txn_no !== undefined) payload.payment_txn_no = payment_txn_no;
  return updateBooking(booking_id, payload, { client });
}

// Calendar view - bookings grouped by date with scope filtering
async function getBookingsCalendar({ from = null, to = null, attraction_id = null, combo_id = null, attractionScope = null, comboScope = null } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  // Date range
  if (from) {
    where.push(`b.booking_date >= $${i++}`);
    params.push(from);
  }
  if (to) {
    where.push(`b.booking_date <= $${i++}`);
    params.push(to);
  }

  // Attraction filter with scope
  if (attraction_id) {
    where.push(`b.attraction_id = $${i++}`);
    params.push(attraction_id);
  } else if (attractionScope && Array.isArray(attractionScope) && attractionScope.length) {
    where.push(`b.attraction_id = ANY($${i++}::bigint[])`);
    params.push(attractionScope);
  }

  // Combo filter with scope
  if (combo_id) {
    where.push(`b.combo_id = $${i++}`);
    params.push(combo_id);
  } else if (comboScope && Array.isArray(comboScope) && comboScope.length) {
    where.push(`b.combo_id = ANY($${i++}::bigint[])`);
    params.push(comboScope);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT 
       b.booking_date,
       COUNT(*) as total_bookings,
       COUNT(CASE WHEN b.payment_status = 'Completed' THEN 1 END) as paid_bookings,
       COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN b.quantity END), 0) as total_people,
       COALESCE(SUM(CASE WHEN b.payment_status = 'Completed' THEN COALESCE(b.final_amount, b.total_amount, 0) END), 0) as total_revenue
     FROM bookings b
     ${whereSql}
     GROUP BY b.booking_date
     ORDER BY b.booking_date DESC`,
    params
  );

  return rows;
}

// Slots summary - available/booked slots per attraction/combo with scope filtering
async function getBookingSlotsSummary({ date = null, attraction_id = null, combo_id = null, attractionScope = null, comboScope = null } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  // Date filter
  if (date) {
    where.push(`b.booking_date = $${i++}`);
    params.push(date);
  }

  // Attraction filter with scope
  if (attraction_id) {
    where.push(`b.attraction_id = $${i++}`);
    params.push(attraction_id);
  } else if (attractionScope && Array.isArray(attractionScope) && attractionScope.length) {
    where.push(`b.attraction_id = ANY($${i++}::bigint[])`);
    params.push(attractionScope);
  }

  // Combo filter with scope
  if (combo_id) {
    where.push(`b.combo_id = $${i++}`);
    params.push(combo_id);
  } else if (comboScope && Array.isArray(comboScope) && comboScope.length) {
    where.push(`b.combo_id = ANY($${i++}::bigint[])`);
    params.push(comboScope);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       CASE
         WHEN b.combo_id IS NOT NULL THEN CONCAT('Combo #', b.combo_id)
         ELSE CONCAT('Attraction #', b.attraction_id)
       END as resource_id,
       CASE
         WHEN b.combo_id IS NOT NULL THEN c.name
         ELSE a.title
       END as resource_title,
       b.booking_time,
       COUNT(*) as booked_slots,
       SUM(b.quantity) as total_quantity
     FROM bookings b
     LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
     LEFT JOIN combos c ON c.combo_id = b.combo_id
     ${whereSql}
     GROUP BY
       b.combo_id,
       b.attraction_id,
       c.name,
       a.title,
       b.booking_time
     ORDER BY b.booking_time`,
    params
  );

  return rows;
}

module.exports = {
  getBookingById,
  getOrderWithDetails,
  listBookings,
  createOrderWithItems, // Use this for the cart checkout
  createBooking,        // Legacy / Internal use
  updatePaymentStatus,
  cancelOrder,
  updateBooking,
  setPayment,
  getBookingsCalendar,
  getBookingSlotsSummary
};