'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const bookingsModel = require('../models/bookings.model');
const ticketService = require('../services/ticketService');

// Serve generated ticket buffer through a virtual public URL
router.get('/generated/:filename', async (req, res, next) => {
    try {
        const { filename } = req.params;

        // Attempt to extract order ref from filename. Usually "ORDER_XYZ123.pdf" or "ticket-ORDER_XYZ123.pdf"
        let orderRef = filename.replace('.pdf', '');
        if (orderRef.startsWith('ticket-')) orderRef = orderRef.replace('ticket-', '');
        if (orderRef.startsWith('ORDER_')) orderRef = orderRef.replace('ORDER_', '');

        let orderId = null;
        let fallbackBookingId = null;

        // First, try order_ref
        const oRes = await pool.query('SELECT order_id FROM orders WHERE order_ref = $1', [orderRef]);
        if (oRes.rows.length > 0) {
            orderId = oRes.rows[0].order_id;
        } else {
            // If we couldn't find an order_ref, maybe it's just the order_id? (e.g. ticket-order-12.pdf)
            if (filename.includes('ticket-order-')) {
                const idMatch = filename.match(/ticket-order-(\d+)/);
                if (idMatch) orderId = Number(idMatch[1]);
            } else {
                // Ultimate fallback: see if the "orderRef" actually matches a booking_ref
                const bRes = await pool.query('SELECT booking_id, order_id FROM bookings WHERE booking_ref = $1', [orderRef]);
                if (bRes.rows.length > 0) {
                    orderId = bRes.rows[0].order_id;
                    fallbackBookingId = bRes.rows[0].booking_id;
                }
            }
        }

        if (!orderId && !fallbackBookingId) {
            return res.status(404).send('Ticket not found');
        }

        // Get booking_id to generate the comprehensive ticket
        let targetBookingId = fallbackBookingId;
        if (!targetBookingId && orderId) {
            const bRes = await pool.query('SELECT booking_id FROM bookings WHERE order_id = $1 ORDER BY booking_id ASC LIMIT 1', [orderId]);
            if (bRes.rows.length > 0) {
                targetBookingId = bRes.rows[0].booking_id;
            }
        }

        if (!targetBookingId) {
            return res.status(404).send('Ticket info not fully found');
        }

        // Check if we already have an S3 URL stored
        const ticketRes = await pool.query('SELECT ticket_pdf FROM bookings WHERE booking_id = $1', [targetBookingId]);
        const ticketPdf = ticketRes.rows[0]?.ticket_pdf;
        if (ticketPdf && ticketPdf.startsWith('http')) {
            return res.redirect(ticketPdf);
        }

        const { buffer } = await ticketService.generateTicketBuffer(targetBookingId);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (err) {
        console.error('Error delivering virtual generated ticket:', err);
        res.status(500).send('Failed to generate ticket');
    }
});

module.exports = router;
