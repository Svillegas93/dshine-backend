/**
 * src/index.js
 * Punto de entrada del servidor D'SHINE API.
 */

require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const connectDB       = require('./config/database');
const { connectRedis } = require('./config/redis');
const { iniciarCrons } = require('./services/cron');
const { apiLimiter }   = require('./middleware/rateLimiter');

const disponibilidadRoutes = require('./routes/disponibilidad');
const reservasRoutes        = require('./routes/reservas');
const serviciosRoutes       = require('./routes/servicios');

// Admin
const adminAuthRoutes      = require('./routes/admin/auth');
const adminReservasRoutes  = require('./routes/admin/reservas');
const adminServiciosRoutes = require('./routes/admin/servicios');
const adminHorariosRoutes  = require('./routes/admin/horarios');
const { adminAuth }        = require('./middleware/adminAuth');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Seguridad ────────────────────────────────────────────────
app.set('trust proxy', 1); // Para rate-limit detrás de Nginx/Render/Railway

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
}));
app.use(express.json({ limit: '50kb' }));

// ── Rate limiting global ─────────────────────────────────────
app.use('/api', apiLimiter);

// ── Rutas ────────────────────────────────────────────────────
app.use('/api/disponibilidad', disponibilidadRoutes);
app.use('/api/reservas',       reservasRoutes);
app.use('/api/servicios',      serviciosRoutes);

// Admin (protegidas con token)
app.use('/api/admin/auth',      adminAuthRoutes);
app.use('/api/admin/reservas',  adminAuth, adminReservasRoutes);
app.use('/api/admin/servicios', adminAuth, adminServiciosRoutes);
app.use('/api/admin/horarios',  adminAuth, adminHorariosRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, servicio: "D'SHINE API", zona: 'America/Bogota' });
});

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// ── Error global ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error global]', err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

// ── Arranque ─────────────────────────────────────────────────
async function arrancar() {
  try {
    await connectDB();
    await connectRedis();

    app.listen(PORT, () => {
      console.log(`\n🚀  D'SHINE API corriendo en puerto ${PORT}`);
      console.log(`   Zona horaria: America/Bogotá`);
      console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
    });

    // Iniciar cron jobs solo en producción
    if (process.env.NODE_ENV === 'production') {
      iniciarCrons();
    }
  } catch (err) {
    console.error('❌  Error arrancando el servidor:', err);
    process.exit(1);
  }
}

arrancar();
