/**
 * utils/slotLock.js
 *
 * Implementa locks atómicos en Redis para prevenir double-booking.
 *
 * Flujo:
 *   1. Usuario A selecciona slot → acquireSlotLock → OK → completa formulario
 *   2. Usuario B selecciona MISMO slot → acquireSlotLock → FALLO (ya bloqueado)
 *   3. Usuario A confirma reserva → slot queda en MongoDB → releaseSlotLock
 *   4. Si Usuario A abandona el formulario → lock expira en 5 min (TTL)
 */

const { getRedis } = require('../config/redis');

// Tiempo que un lock permanece activo (segundos).
// 5 minutos: tiempo razonable para llenar el formulario.
const LOCK_TTL_SECONDS = 300;

/**
 * Construye la clave única del lock.
 * Formato: lock:dshine:{servicioId}:{fechaStr}:{horaInicio}
 */
function buildKey(servicioId, fechaStr, horaInicio) {
  return `lock:dshine:${servicioId}:${fechaStr}:${horaInicio}`;
}

/**
 * Intenta adquirir el lock para un slot.
 * Operación SET NX EX — atómica en Redis.
 *
 * @param {string} servicioId
 * @param {string} fechaStr     "2025-06-15"
 * @param {string} horaInicio   "14:00"
 * @param {string} ownerId      ID único de sesión (para que solo el dueño lo libere)
 * @returns {boolean} true si el lock fue adquirido, false si ya estaba tomado
 */
async function acquireSlotLock(servicioId, fechaStr, horaInicio, ownerId) {
  const redis = getRedis();
  const key = buildKey(servicioId, fechaStr, horaInicio);

  // SET key value NX EX ttl
  // NX = solo si NO existe (atómico — no hay race condition)
  const result = await redis.set(key, ownerId, {
    NX: true,
    EX: LOCK_TTL_SECONDS,
  });

  return result === 'OK';
}

/**
 * Libera el lock solo si el ownerId coincide.
 * Evita que un usuario libere el lock de otro.
 *
 * Usa un script Lua para que la verificación + delete sea atómica.
 *
 * @param {string} servicioId
 * @param {string} fechaStr
 * @param {string} horaInicio
 * @param {string} ownerId
 * @returns {boolean} true si fue liberado
 */
async function releaseSlotLock(servicioId, fechaStr, horaInicio, ownerId) {
  const redis = getRedis();
  const key = buildKey(servicioId, fechaStr, horaInicio);

  // Script Lua: verifica el dueño y borra en una sola operación atómica
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(script, { keys: [key], arguments: [ownerId] });
  return result === 1;
}

/**
 * Verifica si un slot tiene lock activo (sin adquirirlo).
 * Útil para mostrar disponibilidad en tiempo real.
 *
 * @param {string} servicioId
 * @param {string} fechaStr
 * @param {string} horaInicio
 * @returns {boolean} true si está bloqueado
 */
async function isSlotLocked(servicioId, fechaStr, horaInicio) {
  const redis = getRedis();
  const key = buildKey(servicioId, fechaStr, horaInicio);
  const val = await redis.exists(key);
  return val === 1;
}

/**
 * Verifica múltiples slots en paralelo.
 * Más eficiente que llamar isSlotLocked en un loop.
 *
 * @param {string} servicioId
 * @param {string} fechaStr
 * @param {string[]} horas  ["08:00", "09:00", ...]
 * @returns {Set<string>} Set de horas bloqueadas
 */
async function getSlotsLocked(servicioId, fechaStr, horas) {
  if (!horas.length) return new Set();

  const redis = getRedis();
  const keys = horas.map((h) => buildKey(servicioId, fechaStr, h));

  // MGET obtiene todos los valores en una sola llamada a Redis
  const values = await redis.mGet(keys);

  const bloqueados = new Set();
  values.forEach((val, i) => {
    if (val !== null) bloqueados.add(horas[i]);
  });

  return bloqueados;
}

module.exports = {
  acquireSlotLock,
  releaseSlotLock,
  isSlotLocked,
  getSlotsLocked,
  LOCK_TTL_SECONDS,
};
