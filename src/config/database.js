const mongoose = require('mongoose');

const TZ = 'America/Bogota';

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌  MONGODB_URI no definida en .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      // Lean queries por defecto en producción
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    console.log('✅  MongoDB conectado');

    // Aseguramos que dayjs use la zona correcta globalmente
    process.env.TZ = TZ;

  } catch (err) {
    console.error('❌  Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
