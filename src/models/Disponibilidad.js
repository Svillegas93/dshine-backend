const mongoose = require('mongoose');

/**
 * Horario base semanal de D'SHINE.
 * Un documento por día de la semana (0=domingo … 6=sábado).
 * Todas las horas en zona America/Bogotá (UTC-5).
 */
const ExcepcionSchema = new mongoose.Schema(
  {
    fecha: {
      // La fecha exacta del día exceptuado (YYYY-MM-DD en Bogotá)
      type: String,
      required: true,
    },
    motivo: {
      type: String,
      trim: true,
    },
    disponible: {
      // false = día bloqueado (festivo, vacación)
      // true  = día habilitado aunque normalmente estaría cerrado
      type: Boolean,
      required: true,
    },
    horaApertura: {
      // Si disponible=true y es un día especial, sobreescribe el horario normal
      type: String,
      default: null,
    },
    horaCierre: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const DisponibilidadSchema = new mongoose.Schema(
  {
    diaSemana: {
      type: Number,
      min: 0,
      max: 6,
      required: true,
      unique: true,
    },
    nombreDia: {
      // Solo para legibilidad en el admin
      type: String,
      enum: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    },
    activo: {
      type: Boolean,
      default: true,
    },
    horaApertura: {
      // "08:00"
      type: String,
      required: true,
    },
    horaCierre: {
      // "19:00"
      type: String,
      required: true,
    },
    duracionSlotMin: {
      // Granularidad de los slots: 30 o 60 minutos
      type: Number,
      enum: [30, 60],
      default: 60,
    },
    excepciones: [ExcepcionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Disponibilidad', DisponibilidadSchema);
