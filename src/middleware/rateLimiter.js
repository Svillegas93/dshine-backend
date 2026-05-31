/**
 * middleware/rateLimiter.js
 * Protege los endpoints públicos de abuso.
 */

const rateLimit = require('express-rate-limit');

/**
 * Límite general para la API pública.
 * 60 peticiones por minuto por IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas peticiones. Intenta en un momento.',
  },
});

/**
 * Límite más estricto para crear reservas.
 * Máximo 5 reservas por IP cada 15 minutos.
 */
const reservasLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Límite de reservas alcanzado. Espera 15 minutos o contacta por WhatsApp.',
  },
});

module.exports = { apiLimiter, reservasLimiter };
