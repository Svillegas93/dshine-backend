/**
 * routes/admin/horarios.js
 * Gestión del horario semanal y excepciones (festivos, vacaciones).
 *
 * GET  /api/admin/horarios                      → Horario semanal completo
 * PUT  /api/admin/horarios/:diaSemana           → Actualizar un día
 * POST /api/admin/horarios/:diaSemana/excepcion → Agregar excepción (festivo)
 * DELETE /api/admin/horarios/:diaSemana/excepcion/:fecha → Eliminar excepción
 */

const router         = require('express').Router();
const { body, param } = require('express-validator');
const Disponibilidad  = require('../../models/Disponibilidad');
const { validate }    = require('../../middleware/validate');

// GET /api/admin/horarios
router.get('/', async (req, res) => {
  try {
    const horarios = await Disponibilidad.find().sort({ diaSemana: 1 }).lean();
    res.json({ ok: true, horarios });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /api/admin/horarios/:diaSemana
router.put(
  '/:diaSemana',
  [
    param('diaSemana').isInt({ min: 0, max: 6 }),
    body('activo').optional().isBoolean(),
    body('horaApertura').optional().matches(/^\d{2}:\d{2}$/)
      .withMessage('Formato HH:mm'),
    body('horaCierre').optional().matches(/^\d{2}:\d{2}$/)
      .withMessage('Formato HH:mm'),
    body('duracionSlotMin').optional().isIn([30, 60]),
  ],
  validate,
  async (req, res) => {
    try {
      const diaNum = Number(req.params.diaSemana);
      const campos = ['activo', 'horaApertura', 'horaCierre', 'duracionSlotMin'];
      const update = {};
      campos.forEach(c => { if (req.body[c] !== undefined) update[c] = req.body[c]; });

      const horario = await Disponibilidad.findOneAndUpdate(
        { diaSemana: diaNum },
        { $set: update },
        { new: true, upsert: true, runValidators: true }
      ).lean();

      res.json({ ok: true, horario });
    } catch (err) {
      console.error('[admin/horarios PUT]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// POST /api/admin/horarios/:diaSemana/excepcion
router.post(
  '/:diaSemana/excepcion',
  [
    param('diaSemana').isInt({ min: 0, max: 6 }),
    body('fecha').isDate({ format: 'YYYY-MM-DD' }).withMessage('fecha YYYY-MM-DD'),
    body('disponible').isBoolean().withMessage('disponible: true/false'),
    body('motivo').optional().isLength({ max: 200 }),
    body('horaApertura').optional().matches(/^\d{2}:\d{2}$/),
    body('horaCierre').optional().matches(/^\d{2}:\d{2}$/),
  ],
  validate,
  async (req, res) => {
    try {
      const diaNum = Number(req.params.diaSemana);
      const { fecha, disponible, motivo, horaApertura, horaCierre } = req.body;

      // Eliminar excepción existente para esa fecha si hay
      await Disponibilidad.updateOne(
        { diaSemana: diaNum },
        { $pull: { excepciones: { fecha } } }
      );

      // Agregar la nueva
      const excepcion = { fecha, disponible };
      if (motivo)       excepcion.motivo       = motivo;
      if (horaApertura) excepcion.horaApertura = horaApertura;
      if (horaCierre)   excepcion.horaCierre   = horaCierre;

      await Disponibilidad.updateOne(
        { diaSemana: diaNum },
        { $push: { excepciones: excepcion } }
      );

      res.json({ ok: true, excepcion });
    } catch (err) {
      console.error('[admin/horarios excepcion POST]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// DELETE /api/admin/horarios/:diaSemana/excepcion/:fecha
router.delete(
  '/:diaSemana/excepcion/:fecha',
  [param('diaSemana').isInt({ min: 0, max: 6 })],
  validate,
  async (req, res) => {
    try {
      const diaNum = Number(req.params.diaSemana);
      await Disponibilidad.updateOne(
        { diaSemana: diaNum },
        { $pull: { excepciones: { fecha: req.params.fecha } } }
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

module.exports = router;
