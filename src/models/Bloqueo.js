/**
 * models/Bloqueo.js
 *
 * Bloqueos de fechas/horas para el calendario de D'SHINE.
 * Pueden ser días completos o rangos de horas específicos.
 */

const mongoose = require('mongoose');

const bloqueoSchema = new mongoose.Schema({
  // Fecha inicio del bloqueo (YYYY-MM-DD)
  desdeFecha: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  // Fecha fin del bloqueo (igual a desdeFecha si es un solo día)
  hastaFecha: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  // Hora inicio (HH:mm) — si es null, bloquea todo el día
  horaInicio: {
    type: String,
    match: /^\d{2}:\d{2}$/,
    default: null,
  },
  // Hora fin (HH:mm) — si es null, bloquea todo el día
  horaFin: {
    type: String,
    match: /^\d{2}:\d{2}$/,
    default: null,
  },
  // Motivo interno (vacaciones, festivo, mantenimiento, etc.)
  motivo: {
    type: String,
    maxlength: 300,
    default: '',
  },
  // Si está activo o fue eliminado lógicamente
  activo: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Índice para consultas rápidas por fecha
bloqueoSchema.index({ desdeFecha: 1, hastaFecha: 1, activo: 1 });

module.exports = mongoose.model('Bloqueo', bloqueoSchema);
