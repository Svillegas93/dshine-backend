/**
 * routes/disponibilidad.js
 *
 * GET /api/disponibilidad?fecha=2025-06-15&servicioId=xxx
 *   → Retorna todos los slots del día con su estado (disponible/ocupado)
 *
 * GET /api/disponibilidad/mes?anio=2025&mes=6&servicioId=xxx
 *   → Retorna qué días del mes tienen al menos un slot libre
 */

const router = require('express').Router();
const { query } = require('express-validator');
const mongoose = require('mongoose');

const Disponibilidad = require('../models/Disponibilidad');
const Reserva = require('../models/Reserva');
const Servicio = require('../models/Servicio');
const { validate } = require('../middleware/validate');
const {
  diaSemana,
  generarSlots,
  esFechaValida,
  filtrarSlotsPasados,
  fechaStrToDate,
  toFechaStr,
  sumarMinutos,
} = require('../utils/fecha');
const { getSlotsLocked } = require('../utils/slotLock');

// ── Validadores ──────────────────────────────────────────────

const validarFecha = query('fecha')
  .isDate({ format: 'YYYY-MM-DD' })
  .withMessage('fecha debe ser YYYY-MM-DD')
  .custom((val) => {
    if (!esFechaValida(val)) throw new Error('No puedes reservar en fechas pasadas');
    return true;
  });

const validarServicioId = query('servicioId')
  .isMongoId()
  .withMessage('servicioId inválido');

const validarMes = [
  query('anio').isInt({ min: 2024, max: 2030 }).withMessage('anio inválido'),
  query('mes').isInt({ min: 1, max: 12 }).withMessage('mes inválido (1-12)'),
  validarServicioId,
];

// ── GET /api/disponibilidad ──────────────────────────────────

router.get(
  '/',
  [validarFecha, validarServicioId],
  validate,
  async (req, res) => {
    try {
      const { fecha, servicioId } = req.query;

      // 1. Verificar que el servicio existe y está activo
      const servicio = await Servicio.findById(servicioId).lean();
      if (!servicio || !servicio.activo) {
        return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
      }

      // 2. Obtener horario del día de la semana
      const diaNum = diaSemana(fecha);
      const horario = await Disponibilidad.findOne({ diaSemana: diaNum }).lean();

      // 3. Verificar si el día tiene una excepción (festivo, etc.)
      let abierto = horario?.activo ?? false;
      let apertura = horario?.horaApertura ?? '08:00';
      let cierre = horario?.horaCierre ?? '19:00';
      const duracion = servicio.duracionMin;

      if (horario?.excepciones?.length) {
        const excepcion = horario.excepciones.find((e) => e.fecha === fecha);
        if (excepcion) {
          abierto = excepcion.disponible;
          if (excepcion.horaApertura) apertura = excepcion.horaApertura;
          if (excepcion.horaCierre) cierre = excepcion.horaCierre;
        }
      }

      if (!abierto) {
        return res.json({
          ok: true,
          fecha,
          abierto: false,
          slots: [],
          mensaje: 'No hay atención este día',
        });
      }

      // 4. Generar todos los slots posibles del día
      let slots = generarSlots(apertura, cierre, duracion);

      // 5. Filtrar slots que ya pasaron si es hoy
      slots = filtrarSlotsPasados(slots, fecha);

      if (!slots.length) {
        return res.json({ ok: true, fecha, abierto: true, slots: [] });
      }

      // 6. Obtener reservas confirmadas/pendientes del día en paralelo con locks
      const [reservasDelDia, slotsConLock] = await Promise.all([
        Reserva.find({
          servicioId: new mongoose.Types.ObjectId(servicioId),
          fechaStr: fecha,
          estado: { $in: ['pendiente', 'confirmada'] },
        })
          .select('horaInicio')
          .lean(),

        getSlotsLocked(servicioId, fecha, slots),
      ]);

      // 7. Construir Set de horas ocupadas en DB
      const ocupadosDB = new Set(reservasDelDia.map((r) => r.horaInicio));

      // 8. Construir respuesta final con estado de cada slot
      const slotsConEstado = slots.map((hora) => {
        const ocupadoDB = ocupadosDB.has(hora);
        const bloqueado = slotsConLock.has(hora);

        return {
          hora,
          horaFin: sumarMinutos(hora, duracion),
          disponible: !ocupadoDB && !bloqueado,
          // Para el frontend: distingue reservado (permanente) de bloqueado (temporal)
          razon: ocupadoDB ? 'reservado' : bloqueado ? 'bloqueado' : null,
        };
      });

      return res.json({
        ok: true,
        fecha,
        abierto: true,
        servicio: {
          id: servicio._id,
          nombre: servicio.nombre,
          duracionMin: servicio.duracionMin,
        },
        slots: slotsConEstado,
      });
    } catch (err) {
      console.error('[disponibilidad] Error:', err);
      res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
  }
);

// ── GET /api/disponibilidad/mes ──────────────────────────────
// Devuelve qué días del mes tienen al menos 1 slot libre.
// Útil para desactivar días en el calendario del frontend.

router.get('/mes', validarMes, validate, async (req, res) => {
  try {
    const { anio, mes, servicioId } = req.query;
    const anioNum = parseInt(anio, 10);
    const mesNum = parseInt(mes, 10); // 1-12

    // Días del mes
    const diasEnMes = new Date(anioNum, mesNum, 0).getDate();

    // Construir lista de fechas "YYYY-MM-DD"
    const fechas = Array.from({ length: diasEnMes }, (_, i) => {
      const d = i + 1;
      return `${anio}-${String(mesNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }).filter(esFechaValida);

    if (!fechas.length) {
      return res.json({ ok: true, diasDisponibles: [] });
    }

    // Obtener servicio para saber duración
    const servicio = await Servicio.findById(servicioId).select('duracionMin activo').lean();
    if (!servicio?.activo) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }

    // Obtener horarios de la semana de una sola vez
    const horariosSemana = await Disponibilidad.find().lean();
    const horarioMap = {};
    horariosSemana.forEach((h) => { horarioMap[h.diaSemana] = h; });

    // Obtener reservas del mes completo en una sola query
    const inicioMes = fechaStrToDate(fechas[0]);
    const finMes = fechaStrToDate(fechas[fechas.length - 1]);
    finMes.setUTCDate(finMes.getUTCDate() + 1); // hasta el día siguiente

    const reservasDelMes = await Reserva.find({
      servicioId: new mongoose.Types.ObjectId(servicioId),
      fecha: { $gte: inicioMes, $lt: finMes },
      estado: { $in: ['pendiente', 'confirmada'] },
    })
      .select('fechaStr horaInicio')
      .lean();

    // Agrupar reservas por fecha
    const reservasPorFecha = {};
    reservasDelMes.forEach((r) => {
      if (!reservasPorFecha[r.fechaStr]) reservasPorFecha[r.fechaStr] = new Set();
      reservasPorFecha[r.fechaStr].add(r.horaInicio);
    });

    // Para cada fecha, calcular si tiene al menos 1 slot libre
    const diasDisponibles = fechas.filter((fecha) => {
      const diaNum = diaSemana(fecha);
      const horario = horarioMap[diaNum];
      if (!horario?.activo) return false;

      // Verificar excepciones
      const excepcion = horario.excepciones?.find((e) => e.fecha === fecha);
      if (excepcion && !excepcion.disponible) return false;

      const apertura = excepcion?.horaApertura ?? horario.horaApertura;
      const cierre = excepcion?.horaCierre ?? horario.horaCierre;

      let slots = generarSlots(apertura, cierre, servicio.duracionMin);
      slots = filtrarSlotsPasados(slots, fecha);

      const ocupados = reservasPorFecha[fecha] || new Set();
      return slots.some((s) => !ocupados.has(s));
    });

    res.json({ ok: true, anio: anioNum, mes: mesNum, diasDisponibles });
  } catch (err) {
    console.error('[disponibilidad/mes] Error:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
