/**
 * routes/admin/bloqueos.js
 *
 * GET    /api/admin/bloqueos         → Listar bloqueos activos
 * POST   /api/admin/bloqueos         → Crear bloqueo
 * DELETE /api/admin/bloqueos/:id     → Eliminar bloqueo
 */

const router = require('express').Router();
const { body, param } = require('express-validator');
const Bloqueo  = require('../../models/Bloqueo');
const { validate } = require('../../middleware/validate');

// GET /api/admin/bloqueos
router.get('/', async (req, res) => {
  try {
    const bloqueos = await Bloqueo.find({ activo: true })
      .sort({ desdeFecha: 1 })
      .lean();
    res.json({ ok: true, bloqueos });
  } catch (err) {
    console.error('[admin/bloqueos GET]', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /api/admin/bloqueos
router.post(
  '/',
  [
    body('desdeFecha')
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('desdeFecha debe ser YYYY-MM-DD'),
    body('hastaFecha')
      .optional()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('hastaFecha debe ser YYYY-MM-DD'),
    body('horaInicio')
      .optional({ checkFalsy: true })
      .matches(/^\d{2}:\d{2}$/)
      .withMessage('horaInicio debe ser HH:mm'),
    body('horaFin')
      .optional({ checkFalsy: true })
      .matches(/^\d{2}:\d{2}$/)
      .withMessage('horaFin debe ser HH:mm'),
    body('motivo')
      .optional()
      .isLength({ max: 300 })
      .withMessage('Motivo máximo 300 caracteres'),
  ],
  validate,
  async (req, res) => {
    try {
      const { desdeFecha, hastaFecha, horaInicio, horaFin, motivo } = req.body;

      const bloqueo = await Bloqueo.create({
        desdeFecha,
        hastaFecha: hastaFecha || desdeFecha,
        horaInicio: horaInicio || null,
        horaFin:    horaFin    || null,
        motivo:     motivo     || '',
        activo: true,
      });

      res.status(201).json({ ok: true, bloqueo });
    } catch (err) {
      console.error('[admin/bloqueos POST]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// DELETE /api/admin/bloqueos/:id
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('ID inválido')],
  validate,
  async (req, res) => {
    try {
      const bloqueo = await Bloqueo.findByIdAndUpdate(
        req.params.id,
        { activo: false },
        { new: true }
      );
      if (!bloqueo) {
        return res.status(404).json({ ok: false, error: 'Bloqueo no encontrado' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/bloqueos DELETE]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

module.exports = router;
