/**
 * services/notificaciones.js
 *
 * Envia confirmaciones y recordatorios por WhatsApp (Twilio).
 * Si WhatsApp falla -> fallback a SMS.
 * Zona horaria: America/Bogota.
 */

const twilio = require('twilio');
const Reserva = require('../models/Reserva');

// Dias y meses en espanol para los mensajes
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatearFecha(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  const nombreDia  = DIAS[d.getUTCDay()];
  const nombreMes  = MESES[mes - 1];
  return `${nombreDia} ${dia} de ${nombreMes} de ${anio}`;
}

let twilioClient = null;
function getTwilio() {
  if (!twilioClient) {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token || sid === 'sin_configurar') return null;
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

async function enviarWhatsApp(telefono, mensaje) {
  const client = getTwilio();
  if (!client) return false;
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   `whatsapp:${telefono}`,
      body: mensaje,
    });
    return true;
  } catch (err) {
    console.error('[WhatsApp] Error:', err.message);
    return false;
  }
}

async function enviarSMS(telefono, mensaje) {
  const client = getTwilio();
  if (!client) return false;
  try {
    await client.messages.create({
      from: process.env.TWILIO_SMS_FROM,
      to:   telefono,
      body: mensaje,
    });
    return true;
  } catch (err) {
    console.error('[SMS] Error:', err.message);
    return false;
  }
}

// -- Plantillas de mensajes

function msgConfirmacion(reserva, cliente, servicio) {
  const fecha = formatearFecha(reserva.fechaStr);
  return `*D-SHINE - Cita confirmada*

Hola ${cliente.nombre}

Codigo: *${reserva.codigo}*
Servicio: ${servicio.nombre}
Fecha: ${fecha}
Hora: ${reserva.horaInicio} - ${reserva.horaFin}
Pereira, Risaralda

Para cancelar o reagendar, escribenos con tu codigo *${reserva.codigo}* o responde este mensaje.

Te esperamos!`;
}

function msgRecordatorio(reserva, cliente, servicio, horasAntes) {
  const fecha = formatearFecha(reserva.fechaStr);
  return `*D-SHINE - Recordatorio*

Hola ${cliente.nombre}, te recordamos tu cita en ${horasAntes}h.

Servicio: ${servicio.nombre}
Fecha: ${fecha}
Hora: ${reserva.horaInicio}
Pereira, Risaralda

Codigo: ${reserva.codigo}`;
}

function msgCancelacion(reserva, cliente, servicio) {
  const fecha = formatearFecha(reserva.fechaStr);
  return `*D-SHINE - Cita cancelada*

Hola ${cliente.nombre}

Tu cita ha sido cancelada.
Servicio: ${servicio.nombre}
Fecha: ${fecha}
Hora: ${reserva.horaInicio}

Para reagendar escribenos cuando quieras.`;
}

function msgReagendamiento(reserva, cliente, servicio) {
  const fecha = formatearFecha(reserva.fechaStr);
  return `*D-SHINE - Cita reagendada*

Hola ${cliente.nombre}

Tu cita fue reagendada exitosamente.
Servicio: ${servicio.nombre}
Nueva fecha: ${fecha}
Nueva hora: ${reserva.horaInicio}

Codigo: ${reserva.codigo}`;
}

// -- Funciones exportadas

async function enviarNotificaciones(reserva, cliente, servicio) {
  const msg = msgConfirmacion(reserva, cliente, servicio);

  // Notificar al cliente
  try {
    const waOk = await enviarWhatsApp(cliente.telefono, msg);
    if (!waOk) {
      const sms = `D-SHINE: Cita ${reserva.codigo} confirmada. ${servicio.nombre} el ${reserva.fechaStr} a las ${reserva.horaInicio}. Pereira.`;
      await enviarSMS(cliente.telefono, sms);
    }
  } catch(e) {
    console.error('[notificaciones] Error cliente:', e.message);
  }

  // Notificar al admin
  try {
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const adminMsg = `Nueva reserva D-SHINE\n${reserva.codigo}\n${servicio.nombre}\n${cliente.nombre} - ${cliente.telefono}\n${formatearFecha(reserva.fechaStr)} ${reserva.horaInicio}`;
      await enviarWhatsApp(adminPhone, adminMsg);
    }
  } catch(e) {
    console.error('[notificaciones] Error admin:', e.message);
  }
}

async function notificarCancelacion(reserva, cliente, servicioId) {
  try {
    const Servicio = require('../models/Servicio');
    const servicio = await Servicio.findById(servicioId).lean();
    if (!servicio) return;
    const msg = msgCancelacion(reserva, cliente, servicio);
    const waOk = await enviarWhatsApp(cliente.telefono, msg);
    if (!waOk) {
      await enviarSMS(cliente.telefono, `D-SHINE: Tu cita ${reserva.codigo} fue cancelada.`);
    }
  } catch(e) {
    console.error('[notificaciones] Error cancelacion:', e.message);
  }
}

async function notificarReagendamiento(reserva, cliente, servicioId) {
  try {
    const Servicio = require('../models/Servicio');
    const servicio = await Servicio.findById(servicioId).lean();
    if (!servicio) return;
    const msg = msgReagendamiento(reserva, cliente, servicio);
    const waOk = await enviarWhatsApp(cliente.telefono, msg);
    if (!waOk) {
      await enviarSMS(cliente.telefono, `D-SHINE: Tu cita fue reagendada. Nuevo horario: ${reserva.fechaStr} ${reserva.horaInicio}.`);
    }
  } catch(e) {
    console.error('[notificaciones] Error reagendamiento:', e.message);
  }
}

async function enviarRecordatorios(horasAntes) {
  try {
    const { ahoraBogota, sumarMinutos } = require('../utils/fecha');
    const Servicio = require('../models/Servicio');
    const Cliente  = require('../models/Cliente');

    const ahora     = ahoraBogota();
    const objetivo  = new Date(ahora.getTime() + horasAntes * 60 * 60 * 1000);
    const fechaStr  = objetivo.toISOString().slice(0, 10);
    const horaStr   = `${String(objetivo.getHours()).padStart(2,'0')}:${String(objetivo.getMinutes()).padStart(2,'0')}`;

    const reservas = await Reserva.find({
      fechaStr,
      horaInicio: horaStr,
      estado: 'confirmada',
      'notificaciones.recordatorio24h': horasAntes === 24 ? false : undefined,
      'notificaciones.recordatorio1h':  horasAntes === 1  ? false : undefined,
    }).lean();

    for (const reserva of reservas) {
      const cliente  = await Cliente.findById(reserva.clienteId).lean();
      const servicio = await Servicio.findById(reserva.servicioId).lean();
      if (!cliente || !servicio) continue;

      const msg = msgRecordatorio(reserva, cliente, servicio, horasAntes);
      const waOk = await enviarWhatsApp(cliente.telefono, msg);
      if (!waOk) {
        await enviarSMS(cliente.telefono, `D-SHINE: Recordatorio cita ${reserva.codigo} manana ${reserva.fechaStr} a las ${reserva.horaInicio}.`);
      }

      const update = horasAntes === 24
        ? { 'notificaciones.recordatorio24h': true }
        : { 'notificaciones.recordatorio1h':  true };
      await Reserva.updateOne({ _id: reserva._id }, update);
    }
  } catch(e) {
    console.error('[recordatorios] Error:', e.message);
  }
}

module.exports = {
  enviarNotificaciones,
  notificarCancelacion,
  notificarReagendamiento,
  enviarRecordatorios,
};
