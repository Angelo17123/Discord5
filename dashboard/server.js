const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuración - Render requiere PORT environment variable
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin123';

// Bind a 0.0.0.0 para ser accesible desde Render
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Dashboard] Servidor iniciado en http://0.0.0.0:${PORT}`);
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Autenticación simple
const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Rutas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API - Estadísticas
app.get('/api/stats', (req, res) => {
  try {
    // Leer logs recientes
    const logsPath = path.join(process.cwd(), 'logs');
    let recentLogs = [];

    if (fs.existsSync(logsPath)) {
      const logFiles = fs.readdirSync(logsPath)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse()
        .slice(0, 5);

      for (const file of logFiles.slice(0, 1)) {
        const content = fs.readFileSync(path.join(logsPath, file), 'utf-8');
        recentLogs = content.split('\n')
          .filter(line => line.trim())
          .slice(-50)
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return { message: line, timestamp: new Date().toISOString() };
            }
          });
      }
    }

    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      logs: recentLogs,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API - Comandos protegidos
app.post('/api/command', authMiddleware, (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command required' });
  }

  // Aquí puedes implementar comandos remotos
  res.json({ success: true, command });
});

// WebSocket para actualizaciones en tiempo real
io.on('connection', (socket) => {
  console.log('[Dashboard] Cliente conectado');

  socket.on('disconnect', () => {
    console.log('[Dashboard] Cliente desconectado');
  });
});

// Iniciar servidor - Render requiere binding a 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Dashboard] Servidor iniciado en http://0.0.0.0:${PORT}`);
});

module.exports = { app, server, io };
