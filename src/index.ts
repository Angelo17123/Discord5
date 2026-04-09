import { Client, Message } from 'discord.js-selfbot-v13';
import { ExtendedClient, BotConfig } from './types';
import { loadConfig, validateConfig } from './utils/config';
import { log, logError } from './utils/logger';
import { VoiceManager } from './modules/VoiceManager';
import { RaidProtection } from './modules/RaidProtection';
import { CommandHandler } from './handlers/CommandHandler';
import { EventHandler } from './handlers/EventHandler';
import { storeDeletedMessage } from './commands/snipe';
import { checkAfkMention, removeAfkOnMessage } from './commands/afk';
import { randomDelay } from './utils/safety';

// Cargar configuración
const config: BotConfig = loadConfig();

// ============================================
// WEB SERVER PARA RENDER (HEALTH CHECK)
// ============================================
const http = require('http');
const PORT = parseInt(process.env.PORT || '10000', 10);
const server = http.createServer((_req: any, res: any) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

server.listen(PORT, '0.0.0.0', () => {
  log.info(`Health check server en puerto ${PORT}`);
});

// Validar configuración
if (!validateConfig(config)) {
  process.exit(1);
}

// ============================================
// CREAR CLIENTE CON OPCIONES ANTI-DETECCIÓN
// ============================================
const client = new Client({
  // ⚠️ CRÍTICO: Desactivar chunking para reducir tráfico en el gateway
  // Esto evita que Discord detecte actividad anormal al inicio
  // Reducir la huella en el gateway
  ws: {
    properties: {
      // Simular cliente de navegador normal
      browser: 'Chrome',
      os: 'Windows',
      device: '',
    },
  },
}) as ExtendedClient;

// Inicializar propiedades extendidas
client.commands = new Map();
client.aliases = new Map();
client.cooldowns = new Map();
client.config = config;
client.stats = {
  commandsExecuted: 0,
  messagesReceived: 0,
  dmsReceived: 0,
  mentionsReceived: 0,
  voiceConnections: 0,
  reconnections: 0,
  errors: 0,
};
client.startTime = new Date();

// Inicializar módulos
client.voiceManager = new VoiceManager(client);
client.raidProtection = new RaidProtection(client);
client.commandHandler = new CommandHandler(client);
client.eventHandler = new EventHandler(client);

// ============================================
// ANTI-CRASH SYSTEM
// ============================================
if (config.features.antiCrash) {
  process.on('uncaughtException', (error: Error) => {
    logError(error, 'UNCAUGHT EXCEPTION');
    client.stats.errors++;
    client.stats.lastError = error.message;
    client.stats.lastErrorTime = new Date();
  });

  process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
    log.error(`[UNHANDLED REJECTION] ${reason}`);
    client.stats.errors++;
    client.stats.lastError = String(reason);
    client.stats.lastErrorTime = new Date();
  });

  process.on('warning', (warning: Error) => {
    log.warn(`[WARNING] ${warning.message}`);
  });

  log.info('Sistema anti-crash activado');
}

// ============================================
// EVENTOS (CON DELAYS ANTI-DETECCIÓN)
// ============================================

// Detectar mensajes borrados (para snipe) - pasivo, sin riesgo
client.on('messageDelete' as any, (message: Message | any) => {
  if (message.partial) return;
  storeDeletedMessage(message as Message);
});

// Detectar menciones AFK - con delay humano
client.on('messageCreate', async (message: Message) => {
  // Agregar un pequeño delay aleatorio para no responder instantáneamente
  if (message.mentions.has(client.user!.id)) {
    await randomDelay(1500, 4000); // 1.5-4 segundos de delay
  }
  checkAfkMention(message);
  removeAfkOnMessage(message);
});

// ============================================
// INICIALIZACIÓN
// ============================================
async function init(): Promise<void> {
  try {
    log.info('=================================');
    log.info('🔒 Discord Client - Stealth Mode');
    log.info('=================================');

    // Cargar comandos
    await client.commandHandler.loadCommands();

    // Cargar eventos
    await client.eventHandler.loadEvents();

    // Iniciar sesión
    await client.login(config.discord.token);

    log.info('Inicialización completada');
  } catch (error) {
    logError(error as Error, 'INIT');
    process.exit(1);
  }
}

// ============================================
// MANEJO DE SEÑALES
// ============================================
process.on('SIGINT', async () => {
  log.info('Recibida señal SIGINT, cerrando graceful...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.info('Recibida señal SIGTERM, cerrando graceful...');
  await client.destroy();
  process.exit(0);
});

// ============================================
// INICIAR
// ============================================
init();

export { client };
