/**
 * middleware/adminAuth.js
 * Protege todas las rutas del panel admin.
 * Usa un token simple de cabecera para no agregar dependencias extra.
 * En producción reemplazar con JWT + refresh tokens.
 */

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  if (token !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ ok: false, error: 'Token inválido' });
  }

  next();
}

module.exports = { adminAuth };
