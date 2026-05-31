/**
 * routes/admin/servicios.js
 * CRUD completo de servicios desde el panel admin.
 *
 * GET    /api/admin/servicios        → Lista todos (incluyendo inactivos)
 * POST   /api/admin/servicios        → Crear nuevo
 * PUT    /api/admin/servicios/:id    → Editar
 * DELETE /api/admin/servicios/:id    → Desactivar (soft delete)
 */

const router   = require('express').Router();
const { body, param } = require('express-validator');
const Servicio = require('../../models/Servicio');
const { validate } = require('../../middleware/validate');

const validarServicio = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 100 }),
  body('categoria')
    .isIn(['facial', 'laser', 'maquillaje'])
    .withMessage('Categoría inválida'),
  body('duracionMin').isInt({ min: 15, max: 480 })
    .withMessage('Duración entre 15 y 480 minutos'),
  body('precio').isFloat({ min: 0 }).withMessage('Precio inválido'),
  body('descripcion').optional().isLength({ max: 500 }),
  body('slug').optional().trim().isSlug().withMessage('Slug inválido'),
];

// GET /api/admin/servicios
router.get('/', async (req, res) => {
  try {
    const servicios = await Servicio.find()
      .sort({ orden: 1, categoria: 1 })
      .lean();
    res.json({ ok: true, servicios });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /api/admin/servicios
router.post('/', validarServicio, validate, async (req, res) => {
  try {
    const { nombre, categoria, duracionMin, precio, descripcion, slug, imagenes } = req.body;

    // Generar slug automático si no viene
    const slugFinal = slug ||
      nombre.toLowerCase()
        .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
        .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o')
        .replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Siguiente orden
    const ultimo = await Servicio.findOne().sort({ orden: -1 }).select('orden').lean();
    const orden  = (ultimo?.orden || 0) + 1;

    const servicio = await Servicio.create({
      slug: slugFinal,
      nombre,
      categoria,
      duracionMin,
      precio,
      descripcion: descripcion || '',
      imagenes:    imagenes    || [],
      orden,
      activo: true,
    });

    res.status(201).json({ ok: true, servicio });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un servicio con ese slug' });
    }
    console.error('[admin/servicios POST]', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /api/admin/servicios/:id
router.put(
  '/:id',
  [param('id').isMongoId(), ...validarServicio.map(v => v.optional())],
  validate,
  async (req, res) => {
    try {
      const campos = ['nombre', 'categoria', 'duracionMin', 'precio',
                      'descripcion', 'imagenes', 'activo', 'orden'];
      const update = {};
      campos.forEach(c => { if (req.body[c] !== undefined) update[c] = req.body[c]; });

      const servicio = await Servicio.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true, runValidators: true }
      ).lean();

      if (!servicio) return res.status(404).json({ ok: false, error: 'No encontrado' });

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error('[admin/servicios PUT]', err);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

// DELETE /api/admin/servicios/:id  (soft delete)
router.delete(
  '/:id',
  [param('id').isMongoId()],
  validate,
  async (req, res) => {
    try {
      const servicio = await Servicio.findByIdAndUpdate(
        req.params.id,
        { $set: { activo: false } },
        { new: true }
      ).lean();

      if (!servicio) return res.status(404).json({ ok: false, error: 'No encontrado' });

      res.json({ ok: true, mensaje: 'Servicio desactivado' });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  }
);

module.exports = router;
