const mongoose = require('mongoose');

/**
 * Genera un código legible tipo DSH-2025-0001
 * Se llama desde el hook pre-save.
 */
async function generarCodigo() {
  const anio = new Date().getFullYear();
  const prefix = `DSH-${anio}-`;

  // Buscamos la última reserva de este año y sumamos 1
  const ultima = await mongoose
    .model('Reserva')
    .findOne({ codigo: { $regex: `^${prefix}` } })
    .sort({ codigo: -1 })
    .select('codigo')
    .lean();

  if (!ultima) return `${prefix}0001`;

  const num = parseInt(ultima.codigo.replace(prefix, ''), 10);
  return `${prefix}${String(num + 1).padStart(4, '0')}`;
}

const NotificacionSchema = new mongoose.Schema(
  {
    whatsappEnviado:    { type: Boolean, default: false },
    emailEnviado:       { type: Boolean, default: false },
    recordatorio24h:    { type: Boolean, default: false },
    recordatorio1h:     { type: Boolean, default: false },
    cancelacionEnviada: { type: Boolean, default: false },
  },
  { _id: false }
);

const ReservaSchema = new mongoose.Schema(
  {
    codigo: {
      type: String,
      unique: true,
      // Se genera automáticamente en pre-save si no viene
    },

    servicioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Servicio',
      required: true,
    },

    clienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
    },

    /**
     * fecha: Date UTC — representa SOLO el día (hora 00:00:00 UTC)
     * horaInicio / horaFin: strings "HH:mm" en zona America/Bogotá
     * Esta separación evita errores de conversión de zona horaria.
     */
    fecha: {
      type: Date,
      required: true,
    },
    fechaStr: {
      // "2025-06-15" — clave de búsqueda rápida, siempre en Bogotá
      type: String,
      required: true,
    },
    horaInicio: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/,
    },
    horaFin: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/,
    },
    duracionMin: {
      type: Number,
      required: true,
    },

    estado: {
      type: String,
      enum: ['pendiente', 'confirmada', 'cancelada', 'completada', 'no_asistio'],
      default: 'confirmada',
    },

    motivoCancelacion: {
      type: String,
      trim: true,
      default: null,
    },

    notas: {
      // Notas del cliente al reservar
      type: String,
      trim: true,
      default: '',
    },

    notasAdmin: {
      // Notas internas del admin
      type: String,
      trim: true,
      default: '',
    },

    notificaciones: {
      type: NotificacionSchema,
      default: () => ({}),
    },

    // Precio capturado al momento de la reserva (puede cambiar en el futuro)
    precioCapturado: {
      type: Number,
    },

    // IP del cliente para detectar abusos
    ipOrigen: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Índices ──────────────────────────────────────────────────
// Búsqueda rápida de conflictos de horario
ReservaSchema.index({ servicioId: 1, fechaStr: 1, estado: 1 });
// Historial del cliente
ReservaSchema.index({ clienteId: 1, fecha: -1 });
// Recordatorios del cron
ReservaSchema.index({ fecha: 1, estado: 1, 'notificaciones.recordatorio24h': 1 });

// ── Hook pre-save: generar código único ───────────────────────
ReservaSchema.pre('save', async function (next) {
  if (!this.codigo) {
    this.codigo = await generarCodigo();
  }
  next();
});

module.exports = mongoose.model('Reserva', ReservaSchema);
