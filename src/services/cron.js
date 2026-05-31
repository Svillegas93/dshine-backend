/**
 * services/cron.js
 *
 * Trabajos programados que corren en background:
 *   - Recordatorio 24h antes
 *   - Recordatorio 1h antes
 *   - Marcar reservas pasadas como "completadas"
 *
 * Se ejecutan en zona America/Bogotá.
 */

const cron = require('node-cron');
const Reserva   = require('../models/Reserva');
const Cliente   = require('../models/Cliente');
const Servicio  = require('../models/Servicio');
const { enviarRecordatorio } = require('./notificaciones');
const { ahoraBogota, toFechaStr, sumarMinutos } = require('../utils/fecha');

/**
 * Formatea la hora actual + N horas en "HH:mm".
 */
function horaEnN(horas) {
  const d = ahoraBogota();
  d.setHours(d.getHours() + horas);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Recordatorios de 24 horas.
 * Corre a las 9:00 AM Bogotá todos los días.
 * Busca reservas de mañana que no tienen recordatorio enviado.
 */
function iniciarRecordatorio24h() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Ejecutando recordatorios 24h...');
    try {
      const ahora = ahoraBogota();
      const manana = new Date(ahora);
      manana.setDate(manana.getDate() + 1);
      const mananaStr = toFechaStr(manana);

      const reservas = await Reserva.find({
        fechaStr: mananaStr,
        estado: 'confirmada',
        'notificaciones.recordatorio24h': false,
      })
        .populate('clienteId', 'nombre telefono preferencias')
        .populate('servicioId', 'nombre')
        .lean();

      console.log(`[cron] ${reservas.length} reservas para recordatorio 24h`);

      for (const r of reservas) {
        if (!r.clienteId?.preferencias?.recordatorioWhatsapp) continue;
        await enviarRecordatorio(r, r.clienteId, r.servicioId, 24);
        // Pequeña pausa para no saturar la API de Twilio
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('[cron 24h] Error:', err.message);
    }
  }, { timezone: 'America/Bogota' });

  console.log('✅  Cron recordatorio 24h registrado (9:00 AM Bogotá)');
}

/**
 * Recordatorios de 1 hora.
 * Corre cada 15 minutos y busca reservas en ~60 min.
 */
function iniciarRecordatorio1h() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const ahora = ahoraBogota();
      const hoyStr = toFechaStr(ahora);

      // Hora objetivo: ahora + 60 min ± 7 min (margen de ejecución del cron)
      const horaObjMin = ahora.getHours() * 60 + ahora.getMinutes() + 53; // +53 min
      const horaObjMax = horaObjMin + 15; // ventana de 15 minutos

      const horasTarget = [];
      for (let m = horaObjMin; m <= horaObjMax; m++) {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        horasTarget.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
      }

      if (!horasTarget.length) return;

      const reservas = await Reserva.find({
        fechaStr: hoyStr,
        horaInicio: { $in: horasTarget },
        estado: 'confirmada',
        'notificaciones.recordatorio1h': false,
      })
        .populate('clienteId', 'nombre telefono preferencias')
        .populate('servicioId', 'nombre')
        .lean();

      for (const r of reservas) {
        if (!r.clienteId?.preferencias?.recordatorioWhatsapp) continue;
        await enviarRecordatorio(r, r.clienteId, r.servicioId, 1);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error('[cron 1h] Error:', err.message);
    }
  }, { timezone: 'America/Bogota' });

  console.log('✅  Cron recordatorio 1h registrado (cada 15 min)');
}

/**
 * Marcar reservas pasadas como "completadas".
 * Corre a las 11 PM todos los días.
 */
function iniciarMarcadorCompletadas() {
  cron.schedule('0 23 * * *', async () => {
    try {
      const hoyStr = toFechaStr(ahoraBogota());

      const resultado = await Reserva.updateMany(
        {
          fechaStr: { $lt: hoyStr },
          estado: 'confirmada',
        },
        { $set: { estado: 'completada' } }
      );

      if (resultado.modifiedCount > 0) {
        console.log(`[cron] ${resultado.modifiedCount} reservas marcadas como completadas`);
      }
    } catch (err) {
      console.error('[cron completadas] Error:', err.message);
    }
  }, { timezone: 'America/Bogota' });

  console.log('✅  Cron marcador completadas registrado (11 PM Bogotá)');
}

/**
 * Inicia todos los cron jobs.
 * Llamar desde index.js después de conectar a la DB.
 */
function iniciarCrons() {
  iniciarRecordatorio24h();
  iniciarRecordatorio1h();
  iniciarMarcadorCompletadas();
}

module.exports = { iniciarCrons };
