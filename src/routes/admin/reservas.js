/**
 * routes/admin/reservas.js
 * Gestión completa de reservas desde el panel admin.
 *
 * GET    /api/admin/reservas              → Lista con filtros
 * GET    /api/admin/reservas/stats        → Estadísticas del dashboard
 * GET    /api/admin/reservas/:id          → Detalle
 * PUT    /api/admin/reservas/:id/estado   → Cambiar estado
 * PUT    /api/admin/reservas/:id/notas    → Agregar nota interna
 */

const router   = require('express').Router();
const { body, query, param } = require('express-validator');
const mongoose = require('mongoose');
const Reserva  = require('../../models/Reserva');
const Cliente  = require('../../models/Cliente');
const { validate } = require('../../middleware/validate');
const { toFechaStr, ahoraBogota } = require('../../utils/fecha');
const { notificarCancelacion, notificarReagendamiento } =
  require('../../services/notificaciones');

// ── GET /api/admin/reservas ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      fecha,         // "2025-06-15" filtrar día exacto
      desde,         // "2025-06-01" rango inicio
      hasta,         // "2025-06-30" rango fin
      estado,        // "confirmada" | "cancelada" | etc
      servicioId,
      buscar,        // texto libre: nombre o teléfono del cliente
      pagina = 1,
      porPagina = 20,
    } = req.query;

    const filtro = {};

    if (fecha) {
      filtro.fechaStr = fecha;
    } else if (desde || hasta) {
      filtro.fechaStr = {};
      if (desde) filtro.fechaStr.$gte = desde;
      if (hasta) filtro.fechaStr.$lte = hasta;
    }

    if (estado)     filtro.estado     = estado;
    if (servicioId) filtro.servicioId = new mongoose.Types.ObjectId(servicioId);

    // Búsqueda por cliente (requiere lookup)
    let clienteIds = null;
    if (buscar) {
      const clientes = await Cliente.find({
        $or: [
          { nombre:   { $regex: buscar, $options: 'i' } },
          { telefono: { $regex: buscar, $options: 'i' } },
        ],
      }).select('_id').lean();
      clienteIds = clientes.map((c) => c._id);
      filtro.clienteId = { $in: clienteIds };
    }

    const skip  = (Number(pagina) - 1) * Number(porPagina);
    const total = await Reserva.countDocuments(filtro);

    const reservas = await Reserva.find(filtro)
      .sort({ fechaStr: 1, horaInicio: 1 })
      .skip(skip)
      .limit(Number(porPagina))
      .populate('clienteId',  'nombre telefono email')
      .populate('servicioId', 'nombre categoria duracionMin precio')
      .lean();

    res.json({
      ok: true,
      total,
      pagina:    Number(pagina),
      porPagina: Number(porPagina),
      paginas:   Math.ceil(total / Number(porPagina)),
      reservas,
    });
  } catch (err) {
    console.error('[admin/reservas GET]', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ── GET /api/admin/reservas/stats ────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const hoy     = toFechaStr(ahoraBogota());
    const inicioMes = hoy.slice(0, 7) + '-01'; // "2025-06-01"

    const [hoyCount, mesCount, ingresosMes, porEstado, proximas] =
      await Promise.all([
        // Reservas de hoy
        Reserva.countDocuments({ fechaStr: hoy, estado: 'confirmada' }),

        // Reservas del mes
        Reserva.countDocuments({
          fechaStr: { $gte: inicioMes, $lte: hoy },
          estado: { $in: ['confirmada', 'completada'] },
        }),

        // Ingresos del mes (precio capturado)
        Reserva.aggregate([
          {
            $match: {
              fechaStr: { $gte: inicioMes, $lte: hoy },
              estado:   { $in: ['confirmada', 'completada'] },
            },
          },
          { $group: { _id: null, total: { $sum: '$precioCapturado' } } },
        ]),

        // Conteo por estado
        Reserva.aggregate([
          { $group: { _id: '$estado', count: { $sum: 1 } } },
        ]),

        // Próximas 5 reservas del día
        Reserva.find({ fechaStr: hoy, estado: 'confirmada' })
          .sort({ horaInicio: 1 })
          .limit(5)
          .populate('clienteId',  'nombre telefono')
          .populate('servicioId', 'nombre')
          .lean(),
      ]);

    const estadoMap = {};
    porEstado.forEach(({ _id, count }) => { estadoMap[_id] = count; });

    res.json({
      ok: true,
      hoy: {
        fecha:   hoy,
        reservas: hoyCount,
        proximas,
      },
      mes: {
        reservas: mesCount,
        ingresos: ingresosMes[0]?.total || 0,
      },
      estados: estadoMap,
    });
  } catch (err) {
    console.error('[admin/reservas/stats]', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ── GET /api/admin/reservas/:id ──────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const reserva = await Reserva.findById(req.params.id)
      .populate('clienteId',  'nombre telefono email preferencias notas')
      .populate('servicioId', 'nombre categoria duracionMin precio')
      .lean();

    if (!reserva) return res.status(404).json({ ok: false, error: 'No encontrada' });

    res.json({ ok: true, reserva });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ── PUT /api/admin/reservas/:id/estado ───────────────────────
router.put(
  '/:id/estado',
  [
    param('id').isMongoId(),
    body('estado')
      .isIn(['confirmada', 'cancelada', 'completada', 'no_asistio'])
      .withMessage('Estado inválido'),
    body('motivo').optional().isLength({ max: 300 }),
  ],
  validate,
  async (req, res) => {
    try {
      const reserva = await Reserva.findById(req.params.id)
        .populate('clienteId',  'nombre telefono')
        .populate('servicioId', 'nombre');

      if (!reserva) return res.status(404).json({ ok: false, error: 'No encontrada' });

      const estadoPrevio = reserva.estado;
      reserva.estado = req.body.estado;
      if (req.body.motivo) reserva.motivoCancelacion = req.body.motivo;
      await reserva.save();

      // Notificar si se canceló desde el admin
      if (req.body.estado === 'cancelada' && estadoPrevio !== 'cancelada') {
        notificarCancelacion(reserva, reserva.clienteId, reserva.servicioId)
          .catch(() => {});
      }

      res.json({ ok: true, estado: reserva.estado });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// ── PUT /api/admin/reservas/:id/notas ────────────────────────
router.put(
  '/:id/notas',
  [param('id').isMongoId(), body('notas').isLength({ max: 1000 })],
  validate,
  async (req, res) => {
    try {
      await Reserva.updateOne(
        { _id: req.params.id },
        { notasAdmin: req.body.notas }
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

module.exports = router;
