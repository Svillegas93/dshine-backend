const mongoose = require('mongoose');

const ServicioSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // e.g. "limpieza-profunda-facial"
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    categoria: {
      type: String,
      enum: ['facial', 'laser', 'maquillaje'],
      required: true,
    },
    descripcion: {
      type: String,
      trim: true,
    },
    duracionMin: {
      type: Number,
      required: true,
      min: 15,
    },
    precio: {
      type: Number,
      required: true,
      min: 0,
    },
    imagenes: [{ type: String }],
    activo: {
      type: Boolean,
      default: true,
    },
    orden: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Servicio', ServicioSchema);
