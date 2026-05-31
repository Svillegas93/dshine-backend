/**
 * utils/fecha.js
 * Todas las operaciones de fecha/hora del sistema pasan por aquí.
 * Zona horaria fija: America/Bogotá (UTC-5, sin cambio de horario).
 */

const TZ = 'America/Bogota';

/**
 * Retorna la fecha actual en Bogotá como objeto con utilidades.
 */
function ahoraBogota() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: TZ })
  );
}

/**
 * Convierte cualquier Date o string de fecha a "YYYY-MM-DD" en zona Bogotá.
 * @param {Date|string} fecha
 * @returns {string} "2025-06-15"
 */
function toFechaStr(fecha) {
  const d = new Date(fecha);
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA da YYYY-MM-DD
}

/**
 * Dado un string "YYYY-MM-DD" (Bogotá), retorna el día de la semana (0=dom..6=sáb).
 * @param {string} fechaStr
 * @returns {number}
 */
function diaSemana(fechaStr) {
  // Parseamos como medianoche UTC para evitar drift de zona
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  // getUTCDay es seguro aquí porque la fecha era medianoche UTC
  return d.getUTCDay();
}

/**
 * Dado un "YYYY-MM-DD" en Bogotá, retorna un Date de medianoche UTC
 * útil para guardar en MongoDB.
 * @param {string} fechaStr
 * @returns {Date}
 */
function fechaStrToDate(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * Suma minutos a un string de hora "HH:mm".
 * @param {string} hora  "08:00"
 * @param {number} mins  60
 * @returns {string}     "09:00"
 */
function sumarMinutos(hora, mins) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Compara dos strings de hora.
 * @returns {number} negativo si a < b, 0 si igual, positivo si a > b
 */
function compararHoras(a, b) {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

/**
 * Genera todos los slots de hora de un día dado un horario.
 * @param {string} apertura  "08:00"
 * @param {string} cierre    "19:00"
 * @param {number} duracion  60
 * @returns {string[]}       ["08:00", "09:00", ...]
 */
function generarSlots(apertura, cierre, duracion) {
  const slots = [];
  let cursor = apertura;

  while (compararHoras(sumarMinutos(cursor, duracion), cierre) <= 0) {
    slots.push(cursor);
    cursor = sumarMinutos(cursor, duracion);
  }

  return slots;
}

/**
 * Verifica si una fecha (string "YYYY-MM-DD") es hoy o futura en Bogotá.
 * @param {string} fechaStr
 * @returns {boolean}
 */
function esFechaValida(fechaStr) {
  const hoyStr = toFechaStr(ahoraBogota());
  return fechaStr >= hoyStr; // comparación lexicográfica funciona con ISO dates
}

/**
 * Si la fecha es hoy, filtra los slots que ya pasaron en Bogotá
 * (con 30 min de margen para preparación).
 * @param {string[]} slots       ["08:00", "09:00", ...]
 * @param {string}   fechaStr    "2025-06-15"
 * @param {number}   margenMin   30
 * @returns {string[]}
 */
function filtrarSlotsPasados(slots, fechaStr, margenMin = 30) {
  const hoyStr = toFechaStr(ahoraBogota());
  if (fechaStr !== hoyStr) return slots;

  const ahora = ahoraBogota();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes() + margenMin;

  return slots.filter((slot) => {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m > minutosAhora;
  });
}

module.exports = {
  TZ,
  ahoraBogota,
  toFechaStr,
  diaSemana,
  fechaStrToDate,
  sumarMinutos,
  compararHoras,
  generarSlots,
  esFechaValida,
  filtrarSlotsPasados,
};
