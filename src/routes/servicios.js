/**
 * routes/servicios.js
 *
 * GET /api/servicios              → Lista todos los servicios activos
 * GET /api/servicios/:slug        → Detalle de un servicio
 */

const router   = require('express').Router();
const { param } = require('express-validator');
const Servicio = require('../models/Servicio');
const { validate } = require('../middleware/validate');

// GET /api/servicios
router.get('/', async (req, res) => {
  try {
    const { categoria } = req.query;
    const filtro = { activo: true };
    if (categoria) filtro.categoria = categoria;

    const servicios = await Servicio.find(filtro)
      .sort({ orden: 1 })
      .select('slug nombre categoria descripcion duracionMin precio imagenes')
      .lean();

    res.json({ ok: true, servicios });
  } catch (err) {
    console.error('[servicios GET] Error:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /api/servicios/:slug
router.get(
  '/:slug',
  [param('slug').isSlug().withMessage('Slug inválido')],
  validate,
  async (req, res) => {
    try {
      const servicio = await Servicio.findOne({
        slug: req.params.slug,
        activo: true,
      }).lean();

      if (!servicio) {
        return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
      }

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error('[servicios GET slug] Error:', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

module.exports = router;
