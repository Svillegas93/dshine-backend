/**
 * services/notificaciones.js
 *
 * Envía confirmaciones y recordatorios por WhatsApp (Twilio).
 * Si WhatsApp falla → fallback a SMS.
 * Zona horaria: America/Bogotá.
 */

const twilio = require('twilio');
const Reserva = require('../models/Reserva');

// Días y meses en español para los mensajes
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Formatea una fecha "YYYY-MM-DD" como "lunes 15 de junio de 2025"
 */
function formatearFecha(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  const nombreDia  = DIAS[d.getUTCDay()];
  const nombreMes  = MESES[mes - 1];
  return `${nombreDia} ${dia} de ${nombreMes} de ${anio}`;
}

/**
 * Retorna el cliente Twilio (lazy init).
 */
let twilioClient = null;
function getTwilio() {
  if (!twilioClient) {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      console.warn('⚠️  Twilio no configurado — notificaciones desactivadas');
      return null;
    }
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

/**
 * Envía un mensaje de WhatsApp.
 * @returns {boolean} true si fue enviado
 */
async function enviarWhatsApp(telefono, mensaje) {
  const client = getTwilio();
  if (!client) return false;

  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,    // 'whatsapp:+14155238886'
      to:   `whatsapp:${telefono}`,
      body: mensaje,
    });
    return true;
  } catch (err) {
    console.error('[WhatsApp] Error:', err.message);
    return false;
  }
}

/**
 * Envía un SMS de texto plano (fallback).
 */
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

// ── Plantillas de mensajes ───────────────────────────────────

function msgConfirmacion(reserva, cliente, servicio) {
  const fecha = formatearFecha(reserva.fechaStr);
  return `✨ *D'SHINE — Cita confirmada*

Hola ${cliente.nombre} 🌟

📋 Código: *${reserva.codigo}*
💆 Servicio: ${servicio.nombre}
📅 Fecha: ${fecha}
⏰ Hora: ${reserva.horaInicio} — ${reserva.horaFin}
📍 Pereira, Risaralda

Para cancelar o reagendar, escríbenos con tu código *${reserva.codigo}* o responde este mensaje.

¡Te esperamos! 💛`;
}

function msgRecordatorio(reserva, cliente, servicio, horasAntes) {
  const fecha = formatearFecha(reserva.fechaStr);
  const tiempoStr = horasAntes === 24 ? 'mañana' : 'en 1 hora';
  return `⏰ *D'SHINE — Recordatorio de cita*

Hola ${cliente.nombre}, tu cita es ${tiempoStr} 🗓️

💆 ${servicio.nombre}
📅 ${fecha}
⏰ ${reserva.horaInicio} — ${reserva.horaFin}

¿Necesitas cancelar o reagendar? Escríbenos con tu código *${reserva.codigo}*

¡Nos vemos pronto! 💛`;
}

function msgCancelacion(reserva, cliente, servicio) {
  return `❌ *D'SHINE — Cita cancelada*

Hola ${cliente.nombre},

Tu cita de *${servicio.nombre}* del ${formatearFecha(reserva.fechaStr)} a las ${reserva.horaInicio} ha sido cancelada.

Si fue un error o deseas reagendar, responde este mensaje o escríbenos al +57 300 203 1782.

¡Te esperamos pronto! 💛`;
}

function msgReagendamiento(reserva, cliente, servicio) {
  return `🔄 *D'SHINE — Cita reagendada*

Hola ${cliente.nombre},

Tu cita fue reagendada exitosamente ✅

📋 Código: *${reserva.codigo}*
💆 Servicio: ${servicio.nombre}
📅 Nueva fecha: ${formatearFecha(reserva.fechaStr)}
⏰ Hora: ${reserva.horaInicio} — ${reserva.horaFin}

¡Te esperamos! 💛`;
}

// ── Funciones exportadas ─────────────────────────────────────

/**
 * Envía confirmación al cliente y notificación al admin.
 * WhatsApp → fallback SMS si falla.
 */
async function enviarNotificaciones(reserva, cliente, servicio) {
  const msg = msgConfirmacion(reserva, cliente, servicio);

  // Notificar al cliente
  try {
    const waOk = await enviarWhatsApp(cliente.telefono, msg);
    if (!waOk) {
      const sms = `D\'SHINE: Cita ${reserva.codigo} confirmada. ${servicio.nombre} el ${reserva.fechaStr} a las ${reserva.horaInicio}. Pereira.`;
      await enviarSMS(cliente.telefono, sms);
    }
  } catch(e) {
    console.error('[notificaciones] Error cliente:', e.message);
  }

  // Notificar al admin
  try {
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const adminMsg = `🔔 Nueva reser

  // Notificar al cliente
  const waOk = await enviarWhatsApp(cliente.telefono, msg);
  if (!waOk) {
    // Fallback SMS con mensaje corto
    const sms = `D'SHINE: Cita ${reserva.codigo} confirmada. ${servicio.nombre} el ${reserva.fechaStr} a las ${reserva.horaInicio}. Pereira.`;
    await enviarSMS(cliente.telefono, sms);
  }

  // Notificar al admin de D'SHINE
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    const adminMsg = `🔔 *Nueva reserva D'SHINE*\n${reserva.codigo}\n${servicio.nombre}\n${cliente.nombre} — ${cliente.telefono}\n${formatearFecha(reserva.fechaStr)} ${reserva.horaInicio}`;
    await enviarWhatsApp(adminPhone, adminMsg);
  }

  // Marcar notificaciones enviadas
  await Reserva.updateOne(
    { _id: reserva._id },
    { 'notificaciones.whatsappEnviado': waOk }
  );
}

/**
 * Envía recordatorio (24h o 1h antes).
 * @param {Object} reserva
 * @param {Object} cliente
 * @param {Object} servicio
 * @param {24|1}   horasAntes
 */
async function enviarRecordatorio(reserva, cliente, servicio, horasAntes = 24) {
  const msg = msgRecordatorio(reserva, cliente, servicio, horasAntes);
  const waOk = await enviarWhatsApp(cliente.telefono, msg);

  const campo = horasAntes === 24
    ? 'notificaciones.recordatorio24h'
    : 'notificaciones.recordatorio1h';

  await Reserva.updateOne({ _id: reserva._id }, { [campo]: waOk });
}

/**
 * Notifica la cancelación de una cita.
 */
async function notificarCancelacion(reserva, cliente, servicio) {
  const msg = msgCancelacion(reserva, cliente, servicio);
  await enviarWhatsApp(cliente.telefono, msg);
  await Reserva.updateOne(
    { _id: reserva._id },
    { 'notificaciones.cancelacionEnviada': true }
  );
}

/**
 * Notifica un reagendamiento.
 */
async function notificarReagendamiento(reserva, cliente, servicio) {
  const msg = msgReagendamiento(reserva, cliente, servicio);
  await enviarWhatsApp(cliente.telefono, msg);
}

module.exports = {
  enviarNotificaciones,
  enviarRecordatorio,
  notificarCancelacion,
  notificarReagendamiento,
};
