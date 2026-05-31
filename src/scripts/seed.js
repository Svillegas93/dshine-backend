/**
 * npm run seed
 * Carga los servicios y horarios iniciales de D'SHINE en MongoDB.
 * Solo ejecutar una vez en un DB vacío.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Servicio = require('../models/Servicio');
const Disponibilidad = require('../models/Disponibilidad');

const SERVICIOS = [
  // ── Estética Facial ─────────────────────────────────────
  {
    slug: 'limpieza-profunda-facial',
    nombre: 'Limpieza Profunda Facial',
    categoria: 'facial',
    descripcion: 'Protocolo que elimina impurezas, células muertas y exceso de sebo. Ideal para piel congestionada.',
    duracionMin: 60,
    precio: 120000,
    orden: 1,
  },
  {
    slug: 'hydrofacial-dshine',
    nombre: 'Limpieza Hydrofacial DShine',
    categoria: 'facial',
    descripcion: 'Tratamiento multifase con infusión de sueros activos. Resultados inmediatos sin recuperación.',
    duracionMin: 75,
    precio: 200000,
    orden: 2,
  },
  {
    slug: 'hollywood-peeling',
    nombre: 'Hollywood Peeling',
    categoria: 'facial',
    descripcion: 'Carbón activado + tecnología para piel luminosa. El favorito de las celebridades.',
    duracionMin: 75,
    precio: 250000,
    orden: 3,
  },
  {
    slug: 'hidratacion-dshine',
    nombre: 'Hidratación DShine',
    categoria: 'facial',
    descripcion: 'Protocolo intensivo con ácido hialurónico y vitamina C. Piel plump y radiante.',
    duracionMin: 60,
    precio: 180000,
    orden: 4,
  },
  {
    slug: 'peeling-quimico',
    nombre: 'Peeling Químico',
    categoria: 'facial',
    descripcion: 'Ácidos AHA/BHA para renovación celular. Ideal para manchas y textura irregular.',
    duracionMin: 60,
    precio: 150000,
    orden: 5,
  },
  {
    slug: 'hidratacion-labios',
    nombre: 'Hidratación de Labios',
    categoria: 'facial',
    descripcion: 'Ácido hialurónico tópico para labios hidratados y con volumen natural. Sin agujas.',
    duracionMin: 45,
    precio: 130000,
    orden: 6,
  },
  // ── Depilación Láser ────────────────────────────────────
  {
    slug: 'depilacion-laser-zona-pequena',
    nombre: 'Depilación Láser — Zona Pequeña',
    categoria: 'laser',
    descripcion: 'Axilas, ingles, bigote, mentón o dedos.',
    duracionMin: 30,
    precio: 190000,
    orden: 7,
  },
  {
    slug: 'depilacion-laser-zona-mediana',
    nombre: 'Depilación Láser — Zona Mediana',
    categoria: 'laser',
    descripcion: 'Brazos, media pierna, bikini completo o abdomen.',
    duracionMin: 45,
    precio: 280000,
    orden: 8,
  },
  {
    slug: 'depilacion-laser-zona-grande',
    nombre: 'Depilación Láser — Zona Grande',
    categoria: 'laser',
    descripcion: 'Piernas completas, espalda o pecho.',
    duracionMin: 60,
    precio: 380000,
    orden: 9,
  },
  // ── Maquillaje Social ───────────────────────────────────
  {
    slug: 'maquillaje-social',
    nombre: 'Maquillaje Social',
    categoria: 'maquillaje',
    descripcion: 'Look personalizado para eventos, grados, cumpleaños o sesiones fotográficas.',
    duracionMin: 90,
    precio: 150000,
    orden: 10,
  },
  {
    slug: 'maquillaje-novia',
    nombre: 'Maquillaje Novia',
    categoria: 'maquillaje',
    descripcion: 'Maquillaje nupcial de larga duración. Incluye prueba previa.',
    duracionMin: 120,
    precio: 350000,
    orden: 11,
  },
];

const HORARIOS = [
  { diaSemana: 0, nombreDia: 'Domingo',    activo: false, horaApertura: '08:00', horaCierre: '17:00' },
  { diaSemana: 1, nombreDia: 'Lunes',      activo: true,  horaApertura: '08:00', horaCierre: '19:00' },
  { diaSemana: 2, nombreDia: 'Martes',     activo: true,  horaApertura: '08:00', horaCierre: '19:00' },
  { diaSemana: 3, nombreDia: 'Miércoles',  activo: true,  horaApertura: '08:00', horaCierre: '19:00' },
  { diaSemana: 4, nombreDia: 'Jueves',     activo: true,  horaApertura: '08:00', horaCierre: '19:00' },
  { diaSemana: 5, nombreDia: 'Viernes',    activo: true,  horaApertura: '08:00', horaCierre: '19:00' },
  { diaSemana: 6, nombreDia: 'Sábado',     activo: true,  horaApertura: '08:00', horaCierre: '17:00' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅  Conectado a MongoDB');

    // Limpiar colecciones existentes
    await Promise.all([
      Servicio.deleteMany({}),
      Disponibilidad.deleteMany({}),
    ]);
    console.log('🧹  Colecciones limpiadas');

    // Insertar servicios
    const servicios = await Servicio.insertMany(SERVICIOS);
    console.log(`📦  ${servicios.length} servicios creados`);

    // Insertar horarios
    const horarios = await Disponibilidad.insertMany(HORARIOS);
    console.log(`📅  ${horarios.length} horarios creados`);

    console.log('\n🎉  Seed completado exitosamente');
    process.exit(0);
  } catch (err) {
    console.error('❌  Error en seed:', err);
    process.exit(1);
  }
}

seed();
