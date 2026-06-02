/**
 * src/services/email.js
 *
 * Envía emails transaccionales con Resend.
 * Zona horaria: America/Bogota.
 */

const DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatearFecha(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return `${DIAS[d.getUTCDay()]} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === 'sin_configurar') return null;
  try {
    const { Resend } = require('resend');
    return new Resend(key);
  } catch(e) {
    console.error('[email] Resend no instalado:', e.message);
    return null;
  }
}

// ── Template HTML ────────────────────────────────────────────

function templateConfirmacion({ codigo, clienteNombre, servicioNombre, fecha, horaInicio, horaFin, precio }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cita confirmada — D'SHINE</title>
</head>
<body style="margin:0;padding:0;background:#08070B;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#08070B;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- HEADER -->
      <tr><td style="background:#0F0D16;border:1px solid #211D30;padding:40px 48px 32px;text-align:center;border-bottom:none;">
        <div style="font-size:28px;letter-spacing:10px;color:#C9A87C;font-weight:300;margin-bottom:4px;">D'SHINE</div>
        <div style="font-size:10px;letter-spacing:4px;color:#5A5468;text-transform:uppercase;">Estética & Belleza · Pereira</div>
      </td></tr>

      <!-- BANDA DORADA -->
      <tr><td style="background:linear-gradient(90deg,#C9A87C,#E8D4B0,#C9A87C);height:1px;"></td></tr>

      <!-- BODY -->
      <tr><td style="background:#0F0D16;border:1px solid #211D30;border-top:none;border-bottom:none;padding:40px 48px;">

        <p style="font-size:16px;color:#F0EBE3;margin:0 0 8px;">Hola, <strong style="color:#C9A87C;">${clienteNombre}</strong></p>
        <p style="font-size:14px;color:#5A5468;margin:0 0 32px;line-height:1.6;">Tu cita ha sido confirmada exitosamente. Te esperamos.</p>

        <!-- CARD DE CITA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#08070B;border:1px solid #211D30;margin-bottom:32px;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #211D30;">
            <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#5A5468;margin-bottom:4px;">Código de reserva</div>
            <div style="font-size:20px;color:#C9A87C;font-weight:300;letter-spacing:3px;">${codigo}</div>
          </td></tr>
          <tr><td style="padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:16px 24px;border-bottom:1px solid #211D30;border-right:1px solid #211D30;width:50%;">
                  <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5A5468;margin-bottom:4px;">Servicio</div>
                  <div style="font-size:13px;color:#F0EBE3;">${servicioNombre}</div>
                </td>
                <td style="padding:16px 24px;border-bottom:1px solid #211D30;">
                  <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5A5468;margin-bottom:4px;">Valor</div>
                  <div style="font-size:13px;color:#F0EBE3;">${precio ? '$' + precio.toLocaleString('es-CO') : '—'}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;border-right:1px solid #211D30;">
                  <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5A5468;margin-bottom:4px;">Fecha</div>
                  <div style="font-size:13px;color:#F0EBE3;">${fecha}</div>
                </td>
                <td style="padding:16px 24px;">
                  <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5A5468;margin-bottom:4px;">Hora</div>
                  <div style="font-size:13px;color:#C9A87C;font-weight:500;">${horaInicio} — ${horaFin}</div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- INFO LUGAR -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,168,124,0.08);border:1px solid rgba(201,168,124,0.2);margin-bottom:32px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:11px;color:#C9A87C;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">📍 Ubicación</div>
            <div style="font-size:13px;color:#F0EBE3;">Pereira, Risaralda, Colombia</div>
            <div style="font-size:11px;color:#5A5468;margin-top:2px;">Por favor llega 5 minutos antes de tu cita</div>
          </td></tr>
        </table>

        <!-- CANCELAR/REAGENDAR -->
        <p style="font-size:12px;color:#5A5468;line-height:1.7;margin:0;">
          ¿Necesitas cancelar o reagendar? Escríbenos por WhatsApp con tu código <strong style="color:#C9A87C;">${codigo}</strong> o visita
          <a href="https://dshine.com.co/reservas.html" style="color:#C9A87C;text-decoration:none;">dshine.com.co</a>
        </p>

      </td></tr>

      <!-- BANDA DORADA -->
      <tr><td style="background:linear-gradient(90deg,#C9A87C,#E8D4B0,#C9A87C);height:1px;"></td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#0F0D16;border:1px solid #211D30;border-top:none;padding:24px 48px;text-align:center;">
        <p style="font-size:10px;color:#5A5468;letter-spacing:2px;margin:0 0 8px;text-transform:uppercase;">D'SHINE Estética & Belleza</p>
        <p style="font-size:11px;color:#5A5468;margin:0;">
          <a href="https://dshine.com.co" style="color:#C9A87C;text-decoration:none;">dshine.com.co</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function templateRecordatorio({ codigo, clienteNombre, servicioNombre, fecha, horaInicio, horasAntes }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#08070B;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#08070B;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:#0F0D16;border:1px solid #211D30;padding:32px 48px;text-align:center;">
        <div style="font-size:24px;letter-spacing:8px;color:#C9A87C;margin-bottom:4px;">D'SHINE</div>
        <div style="font-size:9px;letter-spacing:3px;color:#5A5468;text-transform:uppercase;margin-bottom:24px;">Recordatorio de cita</div>
        <p style="font-size:15px;color:#F0EBE3;margin:0 0 6px;">Hola, <strong style="color:#C9A87C;">${clienteNombre}</strong></p>
        <p style="font-size:13px;color:#5A5468;margin:0 0 28px;">Te recordamos que tienes una cita en <strong>${horasAntes === 24 ? '24 horas' : '1 hora'}</strong>.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#08070B;border:1px solid #211D30;text-align:left;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;border-bottom:1px solid #211D30;">
            <div style="font-size:9px;letter-spacing:2px;color:#5A5468;text-transform:uppercase;margin-bottom:2px;">Servicio</div>
            <div style="font-size:14px;color:#F0EBE3;">${servicioNombre}</div>
          </td></tr>
          <tr><td style="padding:16px 20px;border-bottom:1px solid #211D30;">
            <div style="font-size:9px;letter-spacing:2px;color:#5A5468;text-transform:uppercase;margin-bottom:2px;">Fecha</div>
            <div style="font-size:14px;color:#F0EBE3;">${fecha}</div>
          </td></tr>
          <tr><td style="padding:16px 20px;">
            <div style="font-size:9px;letter-spacing:2px;color:#5A5468;text-transform:uppercase;margin-bottom:2px;">Hora</div>
            <div style="font-size:18px;color:#C9A87C;font-weight:300;">${horaInicio}</div>
          </td></tr>
        </table>
        <p style="font-size:11px;color:#5A5468;margin:0;">Código: <strong style="color:#C9A87C;">${codigo}</strong> · Pereira, Risaralda</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function templateCancelacion({ codigo, clienteNombre, servicioNombre, fecha, horaInicio }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#08070B;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#08070B;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:#0F0D16;border:1px solid #211D30;padding:40px 48px;text-align:center;">
        <div style="font-size:24px;letter-spacing:8px;color:#C9A87C;margin-bottom:4px;">D'SHINE</div>
        <div style="font-size:9px;letter-spacing:3px;color:#5A5468;text-transform:uppercase;margin-bottom:24px;">Cita cancelada</div>
        <p style="font-size:15px;color:#F0EBE3;margin:0 0 6px;">Hola, <strong style="color:#C9A87C;">${clienteNombre}</strong></p>
        <p style="font-size:13px;color:#5A5468;margin:0 0 28px;line-height:1.6;">Tu cita ha sido cancelada. Puedes reagendar cuando quieras.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#08070B;border:1px solid rgba(224,112,112,0.3);text-align:left;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;border-bottom:1px solid #211D30;">
            <div style="font-size:9px;letter-spacing:2px;color:#5A5468;text-transform:uppercase;margin-bottom:2px;">Servicio cancelado</div>
            <div style="font-size:14px;color:#F0EBE3;">${servicioNombre}</div>
          </td></tr>
          <tr><td style="padding:16px 20px;">
            <div style="font-size:9px;letter-spacing:2px;color:#5A5468;text-transform:uppercase;margin-bottom:2px;">Fecha / Hora</div>
            <div style="font-size:13px;color:#F0EBE3;">${fecha} a las ${horaInicio}</div>
          </td></tr>
        </table>
        <a href="https://dshine.com.co/reservas.html" style="display:inline-block;background:#C9A87C;color:#08070B;text-decoration:none;padding:14px 32px;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">Reagendar cita</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Funciones exportadas ─────────────────────────────────────

async function enviarEmailConfirmacion(reserva, cliente, servicio) {
  if (!cliente.email) return false;
  const resend = getResend();
  if (!resend) return false;

  try {
    const fecha = formatearFecha(reserva.fechaStr);
    await resend.emails.send({
      from: "D'SHINE <reservas@dshine.com.co>",
      to: cliente.email,
      subject: `✦ Cita confirmada — ${servicio.nombre} el ${fecha}`,
      html: templateConfirmacion({
        codigo: reserva.codigo,
        clienteNombre: cliente.nombre,
        servicioNombre: servicio.nombre,
        fecha,
        horaInicio: reserva.horaInicio,
        horaFin: reserva.horaFin,
        precio: reserva.precioCapturado,
      }),
    });
    console.log(`[email] Confirmación enviada a ${cliente.email}`);
    return true;
  } catch(e) {
    console.error('[email] Error confirmación:', e.message);
    return false;
  }
}

async function enviarEmailRecordatorio(reserva, cliente, servicio, horasAntes) {
  if (!cliente.email) return false;
  const resend = getResend();
  if (!resend) return false;

  try {
    const fecha = formatearFecha(reserva.fechaStr);
    await resend.emails.send({
      from: "D'SHINE <reservas@dshine.com.co>",
      to: cliente.email,
      subject: `⏰ Recordatorio — Tu cita es ${horasAntes === 1 ? 'en 1 hora' : 'mañana'} · ${servicio.nombre}`,
      html: templateRecordatorio({
        codigo: reserva.codigo,
        clienteNombre: cliente.nombre,
        servicioNombre: servicio.nombre,
        fecha,
        horaInicio: reserva.horaInicio,
        horasAntes,
      }),
    });
    console.log(`[email] Recordatorio ${horasAntes}h enviado a ${cliente.email}`);
    return true;
  } catch(e) {
    console.error('[email] Error recordatorio:', e.message);
    return false;
  }
}

async function enviarEmailCancelacion(reserva, cliente, servicio) {
  if (!cliente.email) return false;
  const resend = getResend();
  if (!resend) return false;

  try {
    const fecha = formatearFecha(reserva.fechaStr);
    await resend.emails.send({
      from: "D'SHINE <reservas@dshine.com.co>",
      to: cliente.email,
      subject: `Tu cita en D'SHINE fue cancelada · ${reserva.codigo}`,
      html: templateCancelacion({
        codigo: reserva.codigo,
        clienteNombre: cliente.nombre,
        servicioNombre: servicio.nombre,
        fecha,
        horaInicio: reserva.horaInicio,
      }),
    });
    console.log(`[email] Cancelación enviada a ${cliente.email}`);
    return true;
  } catch(e) {
    console.error('[email] Error cancelación:', e.message);
    return false;
  }
}

module.exports = {
  enviarEmailConfirmacion,
  enviarEmailRecordatorio,
  enviarEmailCancelacion,
};
