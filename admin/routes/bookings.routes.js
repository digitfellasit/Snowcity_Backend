const router = require('express').Router();
const ctrl = require('../controllers/bookings.controller');
const { ensureScopes, ensureRoles } = require('../../middlewares/authMiddleware');

/**
 * Middleware to inject scope filtering for staff users.
 * Staff only see bookings for their assigned attractions/combos.
 */
async function injectScopes(req, res, next) {
  try {
    const roles = await ensureRoles(req);
    const isSuperLevel = roles.includes('superadmin') || roles.includes('root');
    const isGM = roles.includes('gm') || roles.includes('admin');

    // Superadmin and GM see all bookings — no scoping
    if (isSuperLevel || isGM) {
      req.staffScopes = null;
      return next();
    }

    // Staff: apply attraction/combo scope
    if (roles.includes('staff') || roles.includes('subadmin')) {
      const scopes = await ensureScopes(req);
      req.staffScopes = scopes;
      return next();
    }

    // Other roles (editor) — no bookings access
    if (roles.includes('editor')) {
      return res.status(403).json({ error: 'Forbidden: Editors do not have booking access' });
    }

    // Default: no scoping
    req.staffScopes = null;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Assert handlers exist (clear error if not)
const must = (name, fn) => {
  if (typeof fn !== 'function') throw new Error(`Admin bookings: handler ${name} is not a function`);
};
must('listBookings', ctrl.listBookings);
must('getBookingById', ctrl.getBookingById);
must('createManualBooking', ctrl.createManualBooking);
must('updateBooking', ctrl.updateBooking);
must('cancelBooking', ctrl.cancelBooking);
must('deleteBooking', ctrl.deleteBooking);
must('checkPayPhiStatusAdmin', ctrl.checkPayPhiStatusAdmin);
must('initiatePayPhiPaymentAdmin', ctrl.initiatePayPhiPaymentAdmin);
must('refundPayPhi', ctrl.refundPayPhi);
must('getBookingCalendar', ctrl.getBookingCalendar);
must('getBookingSlots', ctrl.getBookingSlots);
must('resendWhatsApp', ctrl.resendWhatsApp);
must('resendEmail', ctrl.resendEmail);
must('sendTestEmail', ctrl.sendTestEmail);

// List + read — Staff scope applied
router.get('/', injectScopes, ctrl.listBookings);
router.get('/calendar', injectScopes, ctrl.getBookingCalendar);
router.get('/slots', injectScopes, ctrl.getBookingSlots);
router.get('/:id', injectScopes, ctrl.getBookingById);

// Create/update/delete
router.post('/', ctrl.createManualBooking);
router.put('/:id', ctrl.updateBooking);
router.post('/:id/cancel', ctrl.cancelBooking);
router.post('/:id/resend-ticket', ctrl.resendTicket);
router.post('/:id/resend-whatsapp', ctrl.resendWhatsApp);
router.post('/:id/resend-email', ctrl.resendEmail);
router.post('/:id/send-test-email', ctrl.sendTestEmail);
router.get('/:id/ticket', ctrl.downloadTicket);
router.delete('/:id', ctrl.deleteBooking);

// PayPhi (admin)
router.get('/:id/pay/payphi/status', ctrl.checkPayPhiStatusAdmin);
router.post('/:id/pay/payphi/initiate', ctrl.initiatePayPhiPaymentAdmin);
router.post('/:id/pay/payphi/refund', ctrl.refundPayPhi);

module.exports = router;