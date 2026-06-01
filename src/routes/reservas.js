/**
 * routes/reservas.js
 *
 * POST   /api/reservas              → Crear nueva reserva
 * GET    /api/reservas/:codigo      → Consultar reserva por código
 * PUT    /api/reservas/:codigo      → Reagendar reserva
 * DELETE /api/reservas/:codigo      → Cancelar reserva
 */

const router = require('express').Router();
const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

const Reserva      = require('../models/Reserva');
const Cliente      = require('../models/Cliente');
const Servicio     = require('../models/Servicio');
const Disponibilidad = require('../models/Disponibilidad');
const { validate } = require('../middleware/validate');
const { reservasLimiter } = require('../middleware/rateLimiter');
const {
  esFechaValida,
  diaSemana,
  generarSlots,
  filtrarSlotsPasados,
  sumarMinutos,
  fechaStrToDate,
} = require('../utils/fecha');
const {
  acquireSlotLock,
  releaseSlotLock,
} = require('../utils/slotLock');
const { enviarNotificaciones, notificarCancelacion, notificarReagendamiento } =
  require('../services/notificaciones');

// ── Helpers ──────────────────────────────────────────────────

/**
 * Verifica que un slot está disponible en la DB (sin locks).
 * Doble check después de adquirir el lock de Redis.
 */
async function slotDisponibleEnDB(servicioId, fechaStr, horaInicio) {
  const conflicto = await Reserva.findOne({
    servicioId: new mongoose.Types.ObjectId(servicioId),
    fechaStr,
    horaInicio,
    estado: { $in: ['pendiente', 'confirmada'] },
  }).lean();
  return !conflicto;
}

/**
 * Verifica que el slot existe en el horario del día.
 */
async function slotEnHorario(servicioId, fechaStr, horaInicio) {
  const diaNum = diaSemana(fechaStr);
  const horario = await Disponibilidad.findOne({ diaSemana: diaNum }).lean();console.log('[slotEnHorario] diaNum:', diaNum, 'horario:', JSON.stringify(horario));
  if (!horario?.activo) return false;

  const excepcion = horario.excepciones?.find((e) => e.fecha === fechaStr);
  if (excepcion && !excepcion.disponible) return false;

  const servicio = await Servicio.findById(servicioId).select('duracionMin').lean();
  if (!servicio) return false;

  const apertura = excepcion?.horaApertura ?? horario.horaApertura;
  const cierre   = excepcion?.horaCierre   ?? horario.horaCierre;
  const slots    = generarSlots(apertura, cierre, servicio.duracionMin);
  const filtrados = filtrarSlotsPasados(slots, fechaStr);

  return filtrados.includes(horaInicio);
}

// ── Validadores comunes ──────────────────────────────────────

const validarCodigo = param('codigo')
  .matches(/^DSH-\d{4}-\d{4}$/)
  .withMessage('Código inválido. Formato: DSH-AAAA-NNNN');

const validarBodyReserva = [
  body('servicioId').isMongoId().withMessage('servicioId inválido'),
  body('fecha').isDate({ format: 'YYYY-MM-DD' }).withMessage('fecha debe ser YYYY-MM-DD')
    .custom((v) => {
      if (!esFechaValida(v)) throw new Error('No puedes reservar en fechas pasadas');
      return true;
    }),
  body('horaInicio').matches(/^\d{2}:\d{2}$/).withMessage('horaInicio debe ser HH:mm'),
  body('cliente.nombre').trim().notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 80 }).withMessage('Nombre muy largo'),
  body('cliente.telefono').trim().notEmpty().withMessage('El teléfono es requerido')
    .matches(/^[\d\s\+\-]{7,15}$/).withMessage('Teléfono inválido'),
  body('cliente.email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido'),
  body('notas').optional().isLength({ max: 500 }).withMessage('Notas máximo 500 caracteres'),
];

// ── POST /api/reservas ───────────────────────────────────────

router.post('/', reservasLimiter, validarBodyReserva, validate, async (req, res) => {
  const { servicioId, fecha, horaInicio, cliente: clienteData, notas = '' } = req.body;

  // Generar un ownerId único para este intento de reserva
  const ownerId = `${req.ip}-${Date.now()}`;
  let lockAdquirido = false;

  try {
    // ── 1. Verificar que el servicio existe ──────────────────
    const servicio = await Servicio.findById(servicioId).lean();
    if (!servicio || !servicio.activo) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }

    // ── 2. Verificar que el slot está en el horario del día ──
    const slotValido = await slotEnHorario(servicioId, fecha, horaInicio);
    if (!slotValido) {
      return res.status(422).json({
        ok: false,
        error: 'El horario seleccionado no está disponible',
      });
    }

    // ── 3. Adquirir lock en Redis (anti double-booking) ──────
    lockAdquirido = await acquireSlotLock(servicioId, fecha, horaInicio, ownerId);
    if (!lockAdquirido) {
      return res.status(409).json({
        ok: false,
        error: 'Este horario acaba de ser reservado por otra persona. Por favor elige otro.',
      });
    }

    // ── 4. Doble verificación en DB (después del lock) ───────
    const disponibleDB = await slotDisponibleEnDB(servicioId, fecha, horaInicio);
    if (!disponibleDB) {
      return res.status(409).json({
        ok: false,
        error: 'Este horario ya no está disponible. Por favor elige otro.',
      });
    }

    // ── 5. Crear o actualizar cliente ────────────────────────
    let cliente = await Cliente.findOne({ telefono: clienteData.telefono });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: clienteData.nombre,
        telefono: clienteData.telefono,
        email: clienteData.email || null,
      });
    } else {
      // Actualizar nombre si cambió
      if (cliente.nombre !== clienteData.nombre) {
        cliente.nombre = clienteData.nombre;
        if (clienteData.email) cliente.email = clienteData.email;
        await cliente.save();
      }
    }

    // ── 6. Calcular hora de fin ──────────────────────────────
    const horaFin = sumarMinutos(horaInicio, servicio.duracionMin);

    // ── 7. Crear la reserva ──────────────────────────────────
    const reserva = await Reserva.create({
      servicioId: servicio._id,
      clienteId: cliente._id,
      fecha: fechaStrToDate(fecha),
      fechaStr: fecha,
      horaInicio,
      horaFin,
      duracionMin: servicio.duracionMin,
      precioCapturado: servicio.precio,
      estado: 'confirmada',
      notas,
      ipOrigen: req.ip,
    });

    // ── 8. Enviar notificaciones (no bloqueante) ─────────────
    // No esperamos a que terminen para responder al usuario
    enviarNotificaciones(reserva, cliente, servicio).catch((err) => {
      console.error('[reservas] Error enviando notificaciones:', err.message);
    });

    // ── 9. Responder ─────────────────────────────────────────
    return res.status(201).json({
      ok: true,
      reserva: {
        codigo: reserva.codigo,
        servicio: servicio.nombre,
        fecha: reserva.fechaStr,
        horaInicio: reserva.horaInicio,
        horaFin: reserva.horaFin,
        precio: servicio.precio,
      },
      cliente: {
        nombre: cliente.nombre,
        telefono: cliente.telefono,
      },
      mensaje: `¡Cita confirmada! Recibirás confirmación por WhatsApp al ${cliente.telefono}`,
    });
  } catch (err) {
    console.error('[reservas POST] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  } finally {
    // Siempre liberar el lock al terminar (éxito o error)
    if (lockAdquirido) {
      await releaseSlotLock(servicioId, fecha, horaInicio, ownerId).catch(() => {});
    }
  }
});

// ── GET /api/reservas/:codigo ────────────────────────────────

router.get('/:codigo', [validarCodigo], validate, async (req, res) => {
  try {
    const reserva = await Reserva.findOne({ codigo: req.params.codigo })
      .populate('servicioId', 'nombre categoria precio')
      .populate('clienteId', 'nombre telefono email')
      .lean();

    if (!reserva) {
      return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    }

    res.json({
      ok: true,
      reserva: {
        codigo: reserva.codigo,
        estado: reserva.estado,
        servicio: reserva.servicioId?.nombre,
        fecha: reserva.fechaStr,
        horaInicio: reserva.horaInicio,
        horaFin: reserva.horaFin,
        precio: reserva.precioCapturado,
        notas: reserva.notas,
        cliente: {
          nombre: reserva.clienteId?.nombre,
          telefono: reserva.clienteId?.telefono,
        },
        creadaEn: reserva.createdAt,
      },
    });
  } catch (err) {
    console.error('[reservas GET] Error:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ── PUT /api/reservas/:codigo — Reagendar ────────────────────

router.put(
  '/:codigo',
  [
    validarCodigo,
    body('fecha').isDate({ format: 'YYYY-MM-DD' }).withMessage('fecha inválida')
      .custom((v) => {
        if (!esFechaValida(v)) throw new Error('No puedes reagendar en fechas pasadas');
        return true;
      }),
    body('horaInicio').matches(/^\d{2}:\d{2}$/).withMessage('horaInicio debe ser HH:mm'),
  ],
  validate,
  async (req, res) => {
    const { fecha: nuevaFecha, horaInicio: nuevaHora } = req.body;
    const ownerId = `reagendar-${req.ip}-${Date.now()}`;
    let lockAdquirido = false;

    try {
      const reserva = await Reserva.findOne({ codigo: req.params.codigo }).populate('servicioId');
      if (!reserva) {
        return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
      }
      if (reserva.estado === 'cancelada') {
        return res.status(422).json({ ok: false, error: 'No puedes reagendar una reserva cancelada' });
      }
      if (reserva.estado === 'completada') {
        return res.status(422).json({ ok: false, error: 'No puedes reagendar una reserva completada' });
      }

      const servicioId = reserva.servicioId._id.toString();

      // Verificar nuevo slot en horario
      const slotValido = await slotEnHorario(servicioId, nuevaFecha, nuevaHora);
      if (!slotValido) {
        return res.status(422).json({ ok: false, error: 'El nuevo horario no está disponible' });
      }

      // Adquirir lock del nuevo slot
      lockAdquirido = await acquireSlotLock(servicioId, nuevaFecha, nuevaHora, ownerId);
      if (!lockAdquirido) {
        return res.status(409).json({
          ok: false,
          error: 'Ese horario acaba de ser reservado. Elige otro.',
        });
      }

      // Doble check en DB
      const disponible = await slotDisponibleEnDB(servicioId, nuevaFecha, nuevaHora);
      if (!disponible) {
        return res.status(409).json({ ok: false, error: 'Horario no disponible' });
      }

      // Actualizar reserva
      const horaFin = sumarMinutos(nuevaHora, reserva.duracionMin);
      reserva.fecha      = fechaStrToDate(nuevaFecha);
      reserva.fechaStr   = nuevaFecha;
      reserva.horaInicio = nuevaHora;
      reserva.horaFin    = horaFin;
      await reserva.save();

      // Notificar reagendamiento
      const cliente = await Cliente.findById(reserva.clienteId).lean();
      notificarReagendamiento(reserva, cliente, reserva.servicioId).catch((err) => {
        console.error('[reagendar] Error notificando:', err.message);
      });

      res.json({
        ok: true,
        reserva: {
          codigo: reserva.codigo,
          fecha: reserva.fechaStr,
          horaInicio: reserva.horaInicio,
          horaFin: reserva.horaFin,
        },
        mensaje: 'Tu cita fue reagendada. Recibirás confirmación por WhatsApp.',
      });
    } catch (err) {
      console.error('[reservas PUT] Error:', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    } finally {
      if (lockAdquirido) {
        await releaseSlotLock(nuevaFecha, nuevaHora, nuevaFecha, ownerId).catch(() => {});
      }
    }
  }
);

// ── DELETE /api/reservas/:codigo — Cancelar ──────────────────

router.delete(
  '/:codigo',
  [
    validarCodigo,
    body('motivo').optional().isLength({ max: 300 }).withMessage('Motivo muy largo'),
  ],
  validate,
  async (req, res) => {
    try {
      const reserva = await Reserva.findOne({ codigo: req.params.codigo })
        .populate('servicioId', 'nombre')
        .populate('clienteId', 'nombre telefono');

      if (!reserva) {
        return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
      }
      if (['cancelada', 'completada'].includes(reserva.estado)) {
        return res.status(422).json({
          ok: false,
          error: `No puedes cancelar una reserva en estado "${reserva.estado}"`,
        });
      }

      reserva.estado = 'cancelada';
      reserva.motivoCancelacion = req.body.motivo || 'Cancelada por el cliente';
      await reserva.save();

      notificarCancelacion(reserva, reserva.clienteId, reserva.servicioId).catch((err) => {
        console.error('[cancelar] Error notificando:', err.message);
      });

      res.json({
        ok: true,
        mensaje: 'Tu cita fue cancelada. Puedes agendar una nueva cuando quieras.',
      });
    } catch (err) {
      console.error('[reservas DELETE] Error:', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

module.exports = router;
