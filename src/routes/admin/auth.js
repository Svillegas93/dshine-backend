/**
 * routes/admin/auth.js
 * POST /api/admin/login  → valida la clave y retorna un token de sesión
 */

const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../../middleware/validate');

router.post(
  '/login',
  [body('password').notEmpty().withMessage('La contraseña es requerida')],
  validate,
  (req, res) => {
    const { password } = req.body;

    if (password !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
    }

    // Retornamos el mismo secret como token (simple para D'SHINE)
    // En un sistema con múltiples admins usaríamos JWT
    res.json({
      ok: true,
      token: process.env.ADMIN_SECRET,
      admin: { nombre: "Daniela Hernández", negocio: "D'SHINE" },
    });
  }
);

module.exports = router;
