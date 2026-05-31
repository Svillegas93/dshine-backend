/**
 * middleware/validate.js
 * Centraliza la validación de requests con express-validator.
 */

const { validationResult } = require('express-validator');

/**
 * Middleware que revisa los resultados de validación.
 * Si hay errores, responde 422 con el detalle.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      ok: false,
      errores: errors.array().map((e) => ({
        campo: e.path,
        mensaje: e.msg,
      })),
    });
  }
  next();
}

module.exports = { validate };
