/**
 * routes/admin/config.js
 *
 * GET /api/admin/config/:clave       → Obtener valor de configuración
 * PUT /api/admin/config/:clave       → Guardar/actualizar valor
 *
 * Claves usadas:
 *   promo  → Promoción del día { titulo, precio, desc, hasta, activa }
 */

const router = require('express').Router();
const { param, body } = require('express-validator');
const Config   = require('../../models/Config');
const { validate } = require('../../middleware/validate');

// GET /api/admin/config/:clave
router.get(
  '/:clave',
  [param('clave').isAlphanumeric().withMessage('Clave inválida')],
  validate,
  async (req, res) => {
    try {
      const config = await Config.findOne({ clave: req.params.clave }).lean();
      if (!config) {
        return res.status(404).json({ ok: false, error: 'Configuración no encontrada' });
      }
      res.json({ ok: true, clave: config.clave, valor: config.valor, updatedAt: config.updatedAt });
    } catch (err) {
      console.error('[admin/config GET]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// PUT /api/admin/config/:clave
router.put(
  '/:clave',
  [
    param('clave').isLength({ min: 1, max: 50 }).withMessage('Clave inválida'),
  ],
  validate,
  async (req, res) => {
    try {
      const { clave } = req.params;
      const valor = req.body;

      if (!valor || Object.keys(valor).length === 0) {
        return res.status(400).json({ ok: false, error: 'El cuerpo no puede estar vacío' });
      }

      const config = await Config.findOneAndUpdate(
        { clave },
        { $set: { valor, updatedBy: 'admin' } },
        { new: true, upsert: true, runValidators: true }
      ).lean();

      res.json({ ok: true, clave: config.clave, valor: config.valor, updatedAt: config.updatedAt });
    } catch (err) {
      console.error('[admin/config PUT]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// Ruta pública para que el frontend consulte la promo activa
// GET /api/promo/activa  (se registra desde index.js)
async function getPromoActiva(req, res) {
  try {
    const config = await Config.findOne({ clave: 'promo' }).lean();
    if (!config || !config.valor?.activa) {
      return res.json({ ok: true, promo: null });
    }
    // Verificar que no esté vencida
    const hoy = new Date().toISOString().slice(0, 10);
    if (config.valor.hasta && config.valor.hasta < hoy) {
      return res.json({ ok: true, promo: null });
    }
    res.json({ ok: true, promo: config.valor });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

module.exports = router;
module.exports.getPromoActiva = getPromoActiva;
