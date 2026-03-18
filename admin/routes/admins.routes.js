// admin/routes/admins.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/admins.controller');

// /me endpoint — any authenticated admin can fetch own profile
router.get('/me', ctrl.getMe);

// Admin list — superadmin + gm (anyone with admin-management:read)
// Permission guard handled by outer middleware; no extra guard needed since
// requireAuth is already applied at the admin router level.
// But we DO restrict creation to only superadmin role.
router.get('/', ctrl.listAdmins);
router.post('/', ctrl.createAdmin);

// Access management (scoping)
router.get('/:id/access', ctrl.getAccess);
router.put('/:id/access', ctrl.setAccess);
router.delete('/:id', ctrl.deleteAdmin);

module.exports = router;