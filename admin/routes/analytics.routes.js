// admin/routes/analytics.routes.js
const router = require('express').Router();
const adminModel = require('../models/admin.model');
const analyticsCtrl = require('../controllers/analytics.controller');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// No permissions required - all admin users have access
router.get('/', analyticsCtrl.getAnalytics);

router.get('/overview', analyticsCtrl.getOverview);

router.get('/ops-dashboard', analyticsCtrl.getOpsDashboard);

router.get('/reports/transactions', analyticsCtrl.getTransactionReport);
router.get('/reports/guests', analyticsCtrl.getGuestReport);

router.get('/trend', analyticsCtrl.getTrend);

router.get('/top-attractions', analyticsCtrl.getTopAttractions);

router.get('/attractions-breakdown', async (req, res, next) => {
  try {
    const { from = null, to = null } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

    // Apply attraction scope for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    let attractionIds = null;

    // If subadmin, restrict to their allowed attractions
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      attractionIds = attractionScope;
    }

    const data = await adminModel.getAttractionBreakdown({ from, to, limit, attraction_ids: attractionIds });
    res.json(data);
  } catch (err) { next(err); }
});

// Separate attraction revenue endpoint
router.get('/attraction-revenue', async (req, res, next) => {
  try {
    const { from = null, to = null, attraction_id = null } = req.query;

    // Apply attraction scope for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    let finalAttractionId = attraction_id;

    // If subadmin, restrict to their allowed attractions
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      // If a specific attraction is requested, verify it's in their scope
      if (attraction_id) {
        if (!attractionScope.includes(Number(attraction_id))) {
          return res.status(403).json({ error: 'Access denied: Attraction not in your scope' });
        }
      } else {
        // Use first allowed attraction as default for subadmins
        finalAttractionId = attractionScope[0];
      }
    }

    const data = await adminModel.getAttractionRevenueStats({ from, to, attraction_id: finalAttractionId });
    res.json(data);
  } catch (err) { next(err); }
});

// Separate combo revenue endpoint  
router.get('/combo-revenue', async (req, res, next) => {
  try {
    const { from = null, to = null, attraction_id = null, combo_id = null } = req.query;

    // Apply scopes for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    let finalAttractionId = attraction_id;
    let finalComboId = combo_id;

    // If subadmin, restrict to their allowed attractions/combos
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      // If a specific attraction is requested, verify it's in their scope
      if (attraction_id) {
        if (!attractionScope.includes(Number(attraction_id))) {
          return res.status(403).json({ error: 'Access denied: Attraction not in your scope' });
        }
      } else {
        // Use first allowed attraction as default for subadmins
        finalAttractionId = attractionScope[0];
      }
    }

    // Check combo access
    if (!comboScope.includes('*') && comboScope.length > 0) {
      if (combo_id) {
        if (!comboScope.includes(Number(combo_id))) {
          return res.status(403).json({ error: 'Access denied: Combo not in your scope' });
        }
      }
    }

    const data = await adminModel.getComboOfferStats({ from, to, attraction_id: finalAttractionId, combo_id: finalComboId });
    res.json(data);
  } catch (err) { next(err); }
});

// Daily detailed analytics with attraction/combo breakdown
router.get('/daily', async (req, res, next) => {
  try {
    const { from = null, to = null, attraction_id = null, combo_id = null } = req.query;

    // Apply role-based scoping
    const scopes = req.user?.scopes || {};

    const data = await adminModel.getDetailedDailyAnalytics({
      from,
      to,
      attraction_id,
      combo_id,
      user_scopes: scopes
    });
    res.json(data);
  } catch (err) { next(err); }
});

// Split data
router.get('/split', async (req, res, next) => {
  try {
    const { from = null, to = null, group_by = 'payment_status' } = req.query;

    // Apply attraction scope for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    let attractionId = null;

    // If subadmin with limited attractions, use first one
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      attractionId = attractionScope[0];
    }

    const data = await adminModel.getSplitData({ from, to, group_by, attraction_id: attractionId });
    res.json({ group_by, data });
  } catch (err) { next(err); }
});

// CSV export helpers (extend)
function toCsv(rows, headers) {
  const escape = (v) => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // mitigate CSV injection
    if (s.includes('"')) s = s.replace(/"/g, '""');
    if (s.includes(',') || s.includes('\n')) s = `"${s}"`;
    return s;
  };
  const head = headers.map((h) => h.label).join(',');
  const body = rows.map((r) => headers.map((h) => escape(h.get(r))).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

async function getReportRows({ type = 'bookings', from = null, to = null, attraction_id = null, combo_id = null, group_by = 'payment_status' }) {
  switch (type) {
    case 'top-attractions':
      return await adminModel.getTopAttractions({ from, to, limit: 100, attraction_id });
    case 'trend':
    case 'daily':
      return await adminModel.getSalesTrend({ from, to, granularity: 'day', attraction_id });
    case 'attractions-breakdown':
      return await adminModel.getAttractionBreakdown({ from, to, limit: 500 });
    case 'attraction-revenue':
      const attractionStats = await adminModel.getAttractionRevenueStats({ from, to, attraction_id });
      return [{ type: 'Attraction', bookings: attractionStats.attraction_bookings, revenue: attractionStats.attraction_revenue }];
    case 'combo-revenue':
      const comboStats = await adminModel.getComboOfferStats({ from, to, attraction_id, combo_id });
      return [{ type: 'Combo', bookings: comboStats.combo_bookings, revenue: comboStats.combo_revenue }];
    case 'split':
      return (await adminModel.getSplitData({ from, to, group_by })) || [];
    case 'bookings':
    default:
      return await adminModel.getRecentBookings({ limit: 500, offset: 0, attraction_id });
  }
}

function resolveHeaders(type) {
  if (type === 'top-attractions' || type === 'attractions-breakdown') {
    return [
      { label: 'Attraction ID', get: (r) => r.attraction_id },
      { label: 'Title', get: (r) => r.title },
      { label: 'Bookings', get: (r) => r.bookings },
      { label: 'People', get: (r) => r.people },
      { label: 'Revenue', get: (r) => r.revenue },
    ];
  }
  if (type === 'trend' || type === 'daily') {
    return [
      { label: 'Date', get: (r) => r.bucket },
      { label: 'Bookings', get: (r) => r.bookings },
      { label: 'People', get: (r) => r.people },
      { label: 'Revenue', get: (r) => r.revenue },
    ];
  }
  if (type === 'attraction-revenue' || type === 'combo-revenue') {
    return [
      { label: 'Type', get: (r) => r.type },
      { label: 'Bookings', get: (r) => r.bookings },
      { label: 'Revenue', get: (r) => r.revenue },
    ];
  }
  if (type === 'split') {
    const labels = {
      payment_status: ['Payment Status', 'payment_status'],
      booking_status: ['Booking Status', 'booking_status'],
      item_type: ['Item Type', 'item_type'],
    };
    const [label, key] = labels[req?.query?.group_by] || labels.payment_status;
    return [
      { label, get: (r) => r[key] },
      { label: 'Bookings', get: (r) => r.bookings },
      { label: 'People', get: (r) => r.people },
      { label: 'Revenue', get: (r) => r.revenue },
    ];
  }
  return [
    { label: 'Booking ID', get: (r) => r.booking_id },
    { label: 'Customer', get: (r) => r.customer_name },
    { label: 'Email', get: (r) => r.customer_email },
    { label: 'Attraction', get: (r) => r.attraction_title },
    { label: 'Date', get: (r) => r.booking_date },
    { label: 'People', get: (r) => r.quantity },
    { label: 'Amount', get: (r) => r.final_amount },
    { label: 'Payment Status', get: (r) => r.payment_status },
  ];
}

router.get('/report.csv', async (req, res, next) => {
  try {
    const { type = 'bookings', from = null, to = null, attraction_id = null, combo_id = null, group_by = 'payment_status' } = req.query;

    // Apply scopes for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    let finalAttractionId = attraction_id ? Number(attraction_id) : null;
    let finalComboId = combo_id ? Number(combo_id) : null;

    // Validate attraction access
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      if (finalAttractionId && !attractionScope.includes(finalAttractionId)) {
        return res.status(403).json({ error: 'Access denied: Attraction not in your scope' });
      }
    }

    // Validate combo access
    if (!comboScope.includes('*') && comboScope.length > 0) {
      if (finalComboId && !comboScope.includes(finalComboId)) {
        return res.status(403).json({ error: 'Access denied: Combo not in your scope' });
      }
    }

    const rows = await getReportRows({ type, from, to, attraction_id: finalAttractionId, combo_id: finalComboId, group_by });
    const headers = resolveHeaders(type);
    const csv = toCsv(rows, headers);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report_${type}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

router.get('/report.xlsx', async (req, res, next) => {
  try {
    const { type = 'bookings', from = null, to = null, attraction_id = null, combo_id = null, group_by = 'payment_status' } = req.query;

    // Apply scopes for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    let finalAttractionId = attraction_id ? Number(attraction_id) : null;
    let finalComboId = combo_id ? Number(combo_id) : null;

    // Validate attraction access
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      if (finalAttractionId && !attractionScope.includes(finalAttractionId)) {
        return res.status(403).json({ error: 'Access denied: Attraction not in your scope' });
      }
    }

    // Validate combo access
    if (!comboScope.includes('*') && comboScope.length > 0) {
      if (finalComboId && !comboScope.includes(finalComboId)) {
        return res.status(403).json({ error: 'Access denied: Combo not in your scope' });
      }
    }

    const rows = await getReportRows({ type, from, to, attraction_id: finalAttractionId, combo_id: finalComboId, group_by });
    const headers = resolveHeaders(type);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');
    worksheet.columns = headers.map((h) => ({ header: h.label, key: h.key, width: 25 }));
    rows.forEach((row) => {
      const values = {};
      headers.forEach((h) => { values[h.key] = h.get(row); });
      worksheet.addRow(values);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="report_${type}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

router.get('/report.pdf', async (req, res, next) => {
  try {
    const { type = 'bookings', from = null, to = null, attraction_id = null, combo_id = null, group_by = 'payment_status' } = req.query;

    // Apply scopes for subadmins
    const scopes = req.user?.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    let finalAttractionId = attraction_id ? Number(attraction_id) : null;
    let finalComboId = combo_id ? Number(combo_id) : null;

    // Validate attraction access
    if (!attractionScope.includes('*') && attractionScope.length > 0) {
      if (finalAttractionId && !attractionScope.includes(finalAttractionId)) {
        return res.status(403).json({ error: 'Access denied: Attraction not in your scope' });
      }
    }

    // Validate combo access
    if (!comboScope.includes('*') && comboScope.length > 0) {
      if (finalComboId && !comboScope.includes(finalComboId)) {
        return res.status(403).json({ error: 'Access denied: Combo not in your scope' });
      }
    }

    const rows = await getReportRows({ type, from, to, attraction_id: finalAttractionId, combo_id: finalComboId, group_by });
    const headers = resolveHeaders(type);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report_${type}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).text('Snowcity Analytics Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Type: ${type} | Generated: ${new Date().toISOString()}`);
    if (from || to) doc.text(`Range: ${from || 'start'} → ${to || 'now'}`);
    doc.moveDown();

    const colWidths = headers.map(() => Math.floor((doc.page.width - doc.page.margins.left - doc.page.margins.right) / headers.length));
    const drawRow = (cells, isHeader = false) => {
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      cells.forEach((cell, idx) => {
        doc.text(String(cell ?? ''), doc.x, doc.y, { width: colWidths[idx], continued: idx !== cells.length - 1 });
      });
      doc.text('');
      doc.moveDown(0.3);
    };

    drawRow(headers.map((h) => h.label), true);
    doc.moveDown(0.2);
    rows.forEach((row) => {
      drawRow(headers.map((h) => h.get(row)));
      if (doc.y > doc.page.height - 80) doc.addPage();
    });

    if (!rows.length) doc.text('No data for selected filters.', { align: 'center' });

    doc.end();
  } catch (err) { next(err); }
});

module.exports = router;