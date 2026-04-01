/**
 * API Handler para Vercel
 * Todos los endpoints de la aplicación
 */

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

require('dotenv').config();

// Inicializar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Middleware para verificar JWT
 */
function verificarAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * GET /api/data - Obtener todos los clientes
 */
async function getClientes(req, res) {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true });
    
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/login - Login de usuario
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    
    // Verificación simple (en producción usar Supabase Auth)
    if (email === 'admin@holasuite.com' && password === 'hola2025') {
      const token = jwt.sign(
        { email, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.status(200).json({
        token,
        user: { email, role: 'admin' }
      });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/data - Crear cliente
 */
async function crearCliente(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const { data, error } = await supabase
      .from('clientes')
      .insert([req.body])
      .select();
    
    if (error) throw error;
    res.status(201).json(data?.[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/data/:id - Actualizar cliente
 */
async function actualizarCliente(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const id = req.query.id;
    const { data, error } = await supabase
      .from('clientes')
      .update(req.body)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    res.status(200).json(data?.[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/data/:id - Eliminar cliente
 */
async function eliminarCliente(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const id = req.query.id;
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/sales/goals - Obtener metas de ventas
 */
async function getSalesGoals(req, res) {
  try {
    const { data, error } = await supabase
      .from('sales_goals')
      .select('*')
      .order('mes', { ascending: false });
    
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/sales/goal - Crear/actualizar meta
 */
async function crearOActualizarGoal(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const { vendedor, mes, meta_clientes, meta_valor } = req.body;
    
    // Intentar actualizar primero
    const { data: existente } = await supabase
      .from('sales_goals')
      .select('*')
      .eq('vendedor', vendedor)
      .eq('mes', mes);
    
    let data, error;
    
    if (existente && existente.length > 0) {
      ({ data, error } = await supabase
        .from('sales_goals')
        .update({ meta_clientes, meta_valor, updated_at: new Date() })
        .eq('vendedor', vendedor)
        .eq('mes', mes)
        .select());
    } else {
      ({ data, error } = await supabase
        .from('sales_goals')
        .insert([{ vendedor, mes, meta_clientes, meta_valor }])
        .select());
    }
    
    if (error) throw error;
    res.status(200).json(data?.[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/audit - Obtener logs de auditoría
 */
async function getAuditLogs(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Router principal
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { query, method } = req;
  const path = query.path || [];
  
  try {
    // Rutas
    if (path[0] === 'login' && method === 'POST') {
      return login(req, res);
    }
    
    if (path[0] === 'data') {
      if (path[1]) {
        // Con ID
        if (method === 'PUT') return actualizarCliente(req, res);
        if (method === 'DELETE') return eliminarCliente(req, res);
      } else {
        // Sin ID
        if (method === 'GET') return getClientes(req, res);
        if (method === 'POST') return crearCliente(req, res);
      }
    }
    
    if (path[0] === 'sales') {
      if (path[1] === 'goal' && method === 'POST') {
        return crearOActualizarGoal(req, res);
      }
      if (path[1] === 'goals' && method === 'GET') {
        return getSalesGoals(req, res);
      }
    }
    
    if (path[0] === 'audit' && method === 'GET') {
      return getAuditLogs(req, res);
    }
    
    res.status(404).json({ error: 'Endpoint no encontrado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
