/**
 * models/Config.js
 *
 * Configuración general del sistema D'SHINE.
 * Clave-valor flexible para promociones, ajustes, etc.
 */

const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  clave: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  valor: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  updatedBy: {
    type: String,
    default: 'admin',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Config', configSchema);
