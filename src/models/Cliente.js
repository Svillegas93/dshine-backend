const mongoose = require('mongoose');

const ClienteSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    telefono: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Siempre guardar con formato +57XXXXXXXXXX
      set: (v) => {
        const digits = v.replace(/\D/g, '');
        if (digits.startsWith('57') && digits.length === 12) return `+${digits}`;
        if (digits.length === 10) return `+57${digits}`;
        return `+${digits}`;
      },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    preferencias: {
      recordatorioWhatsapp: { type: Boolean, default: true },
      recordatorioEmail:    { type: Boolean, default: false },
    },
    notas: {
      // Notas internas del admin sobre el cliente
      type: String,
      trim: true,
      default: '',
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Índice para buscar rápido por teléfono o email
ClienteSchema.index({ telefono: 1 });
ClienteSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model('Cliente', ClienteSchema);
