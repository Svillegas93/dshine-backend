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
const Reserva        = require('../models/Reserva');
const Servicio       = require('../models/Servicio');
const Bloqueo        = require('../models/Bloqueo');
const { validate }   = require('../middleware/validate');
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

// ── Helpers de bloqueos ──────────────────────────────────────

/**
 * Verifica si una fecha está completamente bloqueada.
 * Retorna true si hay un bloqueo de día completo (sin horas) que cubre esa fecha.
 */
async function fechaBloqueada(fecha) {
  const bloqueo = await Bloqueo.findOne({
    desdeFecha: { $lte: fecha },
    hastaFecha: { $gte: fecha },
    horaInicio: null,
    activo: true,
  }).lean();
  return !!bloqueo;
}

/**
 * Obtiene las horas bloqueadas parcialmente para una fecha.
 * Retorna un Set con las horas (HH:mm) que caen dentro de algún bloqueo parcial.
 */
async function horasBloqueadas(fecha, slots, duracionMin) {
  const bloqueos = await Bloqueo.find({
    desdeFecha: { $lte: fecha },
    hastaFecha: { $gte: fecha },
    horaInicio: { $ne: null },
    activo: true,
  }).lean();

  if (!bloqueos.length) return new Set();

  const bloqueadas = new Set();
  slots.forEach(slot => {
    const [sh, sm] = slot.split(':').map(Number);
    const slotMin = sh * 60 + sm;
    const slotFinMin = slotMin + duracionMin;

    bloqueos.forEach(b => {
      const [bih, bim] = b.horaInicio.split(':').map(Number);
      const bIniMin = bih * 60 + bim;
      // Hora fin del bloqueo (si no tiene, bloquea hasta fin del día)
      let bFinMin = 24 * 60;
      if (b.horaFin) {
        const [bfh, bfm] = b.horaFin.split(':').map(Number);
        bFinMin = bfh * 60 + bfm;
      }
      // El slot se bloquea si se solapa con el rango de bloqueo
      if (slotMin < bFinMin && slotFinMin > bIniMin) {
        bloqueadas.add(slot);
      }
    });
  });

  return bloqueadas;
}

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

      // 2. Verificar bloqueo de día completo
      const diaCompleto = await fechaBloqueada(fecha);
      if (diaCompleto) {
        return res.json({
          ok: true,
          fecha,
          abierto: false,
          slots: [],
          mensaje: 'No hay atención este día',
        });
      }

      // 3. Obtener horario del día de la semana
      const diaNum = diaSemana(fecha);
      const horario = await Disponibilidad.findOne({ diaSemana: diaNum }).lean();

      // 4. Verificar si el día tiene una excepción (festivo, etc.)
      let abierto  = horario?.activo ?? false;
      let apertura = horario?.horaApertura ?? '08:00';
      let cierre   = horario?.horaCierre   ?? '19:00';
      const duracion = servicio.duracionMin;

      if (horario?.excepciones?.length) {
        const excepcion = horario.excepciones.find((e) => e.fecha === fecha);
        if (excepcion) {
          abierto = excepcion.disponible;
          if (excepcion.horaApertura) apertura = excepcion.horaApertura;
          if (excepcion.horaCierre)   cierre   = excepcion.horaCierre;
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

      // 5. Generar todos los slots posibles del día
      let slots = generarSlots(apertura, cierre, duracion);

      // 6. Filtrar slots que ya pasaron si es hoy
      slots = filtrarSlotsPasados(slots, fecha);

      if (!slots.length) {
        return res.json({ ok: true, fecha, abierto: true, slots: [] });
      }

      // 7. Obtener reservas, locks y bloqueos parciales en paralelo
      const [reservasDelDia, slotsConLock, bloqueadasParcial] = await Promise.all([
        Reserva.find({
          servicioId: new mongoose.Types.ObjectId(servicioId),
          fechaStr: fecha,
          estado: { $in: ['pendiente', 'confirmada'] },
        }).select('horaInicio').lean(),

        getSlotsLocked(servicioId, fecha, slots),

        horasBloqueadas(fecha, slots, duracion),
      ]);

      // 8. Construir Set de horas ocupadas en DB
      const ocupadosDB = new Set(reservasDelDia.map((r) => r.horaInicio));

      // 9. Construir respuesta final con estado de cada slot
      const slotsConEstado = slots.map((hora) => {
        const ocupadoDB  = ocupadosDB.has(hora);
        const bloqueado  = slotsConLock.has(hora);
        const bloqueoAdmin = bloqueadasParcial.has(hora);

        return {
          hora,
          horaFin: sumarMinutos(hora, duracion),
          disponible: !ocupadoDB && !bloqueado && !bloqueoAdmin,
          razon: ocupadoDB
            ? 'reservado'
            : bloqueado
            ? 'bloqueado'
            : bloqueoAdmin
            ? 'no_disponible'
            : null,
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

router.get('/mes', validarMes, validate, async (req, res) => {
  try {
    const { anio, mes, servicioId } = req.query;
    const anioNum = parseInt(anio, 10);
    const mesNum  = parseInt(mes, 10);

    const diasEnMes = new Date(anioNum, mesNum, 0).getDate();

    const fechas = Array.from({ length: diasEnMes }, (_, i) => {
      const d = i + 1;
      return `${anio}-${String(mesNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }).filter(esFechaValida);

    if (!fechas.length) {
      return res.json({ ok: true, diasDisponibles: [] });
    }

    const servicio = await Servicio.findById(servicioId).select('duracionMin activo').lean();
    if (!servicio?.activo) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }

    // Obtener horarios, reservas del mes y bloqueos del mes en paralelo
    const inicioMes = fechaStrToDate(fechas[0]);
    const finMes    = fechaStrToDate(fechas[fechas.length - 1]);
    finMes.setUTCDate(finMes.getUTCDate() + 1);

    const [horariosSemana, reservasDelMes, bloqueosDelMes] = await Promise.all([
      Disponibilidad.find().lean(),

      Reserva.find({
        servicioId: new mongoose.Types.ObjectId(servicioId),
        fecha: { $gte: inicioMes, $lt: finMes },
        estado: { $in: ['pendiente', 'confirmada'] },
      }).select('fechaStr horaInicio').lean(),

      Bloqueo.find({
        desdeFecha: { $lte: fechas[fechas.length - 1] },
        hastaFecha: { $gte: fechas[0] },
        activo: true,
      }).lean(),
    ]);

    const horarioMap = {};
    horariosSemana.forEach((h) => { horarioMap[h.diaSemana] = h; });

    const reservasPorFecha = {};
    reservasDelMes.forEach((r) => {
      if (!reservasPorFecha[r.fechaStr]) reservasPorFecha[r.fechaStr] = new Set();
      reservasPorFecha[r.fechaStr].add(r.horaInicio);
    });

    // Separar bloqueos de día completo y parciales
    const bloqueoDiaCompleto = bloqueosDelMes.filter(b => !b.horaInicio);
    const bloqueoParcial     = bloqueosDelMes.filter(b =>  b.horaInicio);

    const diasDisponibles = fechas.filter((fecha) => {
      // Verificar bloqueo de día completo
      const bloqueado = bloqueoDiaCompleto.some(
        b => b.desdeFecha <= fecha && b.hastaFecha >= fecha
      );
      if (bloqueado) return false;

      const diaNum  = diaSemana(fecha);
      const horario = horarioMap[diaNum];
      if (!horario?.activo) return false;

      const excepcion = horario.excepciones?.find((e) => e.fecha === fecha);
      if (excepcion && !excepcion.disponible) return false;

      const apertura = excepcion?.horaApertura ?? horario.horaApertura;
      const cierre   = excepcion?.horaCierre   ?? horario.horaCierre;

      let slots = generarSlots(apertura, cierre, servicio.duracionMin);
      slots = filtrarSlotsPasados(slots, fecha);

      const ocupados = reservasPorFecha[fecha] || new Set();

      // Verificar bloqueos parciales
      return slots.some((slot) => {
        if (ocupados.has(slot)) return false;
        const [sh, sm] = slot.split(':').map(Number);
        const slotMin    = sh * 60 + sm;
        const slotFinMin = slotMin + servicio.duracionMin;

        const bloqueadoParcial = bloqueoParcial.some(b => {
          if (b.desdeFecha > fecha || b.hastaFecha < fecha) return false;
          const [bih, bim] = b.horaInicio.split(':').map(Number);
          const bIniMin = bih * 60 + bim;
          let bFinMin = 24 * 60;
          if (b.horaFin) {
            const [bfh, bfm] = b.horaFin.split(':').map(Number);
            bFinMin = bfh * 60 + bfm;
          }
          return slotMin < bFinMin && slotFinMin > bIniMin;
        });

        return !bloqueadoParcial;
      });
    });

    res.json({ ok: true, anio: anioNum, mes: mesNum, diasDisponibles });
  } catch (err) {
    console.error('[disponibilidad/mes] Error:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
