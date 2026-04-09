import dotenv from 'dotenv';
import { BotConfig } from '../types';
import { log } from './logger';

dotenv.config();

const defaultConfig: BotConfig = {
  discord: {
    token: '',
    baseChannelId: '',
    commandPrefix: ',,', // ⚠️ Prefijo poco común por defecto
  },
  features: {
    autoResponder: {
      enabled: false,
      message: 'Hey, no estoy disponible ahora. Te respondo luego!',
    },
    raidProtection: {
      enabled: false,
      joinLimit: 10,
      timeWindow: 10000,
    },
    antiCrash: true,
    watchdogInterval: 120000, // ⚠️ 2 minutos (antes 30 seg)
    reconnectDelay: 8000,     // ⚠️ 8 segundos (antes 3 seg)
  },
  dashboard: {
    enabled: false, // ⚠️ Desactivado por defecto
    port: 3000,
    password: 'CambiaEstaContraseña123!',
  },
  notifications: {
    webhookUrl: undefined,
    mentionAlerts: false, // ⚠️ Desactivado por defecto
    dmAlerts: false,      // ⚠️ Desactivado por defecto
  },
  debug: {
    enabled: false,
    logLevel: 'info',
  },
};

export function loadConfig(): BotConfig {
  const token = process.env.DISCORD_TOKEN;
  const baseChannelId = process.env.BASE_CHANNEL_ID;

  if (!token) {
    log.error('DISCORD_TOKEN no está definido en .env');
    log.info('Copia .env.example a .env y configura tus variables');
    process.exit(1);
  }

  if (!baseChannelId) {
    log.error('BASE_CHANNEL_ID no está definido en .env');
    process.exit(1);
  }

  const config: BotConfig = {
    discord: {
      token,
      baseChannelId,
      commandPrefix: process.env.COMMAND_PREFIX || defaultConfig.discord.commandPrefix,
    },
    features: {
      autoResponder: {
        enabled: process.env.AUTO_RESPONDER_ENABLED === 'true',
        message: process.env.AUTO_RESPONDER_MESSAGE || defaultConfig.features.autoResponder.message,
      },
      raidProtection: {
        enabled: process.env.RAID_PROTECTION_ENABLED === 'true',
        joinLimit: parseInt(process.env.RAID_PROTECTION_JOIN_LIMIT || '10', 10),
        timeWindow: parseInt(process.env.RAID_PROTECTION_TIME_WINDOW || '10000', 10),
      },
      antiCrash: process.env.ANTI_CRASH_ENABLED !== 'false',
      // ⚠️ SEGURIDAD: Intervalos mínimos de seguridad
      watchdogInterval: Math.max(parseInt(process.env.WATCHDOG_INTERVAL || '120000', 10), 60000),
      reconnectDelay: Math.max(parseInt(process.env.RECONNECT_DELAY || '8000', 10), 5000),
    },
    dashboard: {
      enabled: process.env.DASHBOARD_ENABLED === 'true', // Solo si explícitamente true
      port: parseInt(process.env.DASHBOARD_PORT || '3000', 10),
      password: process.env.DASHBOARD_PASSWORD || defaultConfig.dashboard.password,
    },
    notifications: {
      webhookUrl: process.env.WEBHOOK_URL,
      mentionAlerts: process.env.MENTION_ALERTS === 'true',
      dmAlerts: process.env.DM_ALERTS === 'true',
    },
    debug: {
      enabled: process.env.DEBUG_MODE === 'true',
      logLevel: process.env.LOG_LEVEL || defaultConfig.debug.logLevel,
    },
  };

  log.info('Configuración cargada correctamente');
  // ⚠️ SEGURIDAD: NO loguear la config completa (contiene el token)
  log.debug(`Prefijo: ${config.discord.commandPrefix}`);
  log.debug(`Watchdog: ${config.features.watchdogInterval}ms`);
  log.debug(`Reconexión: ${config.features.reconnectDelay}ms`);

  return config;
}

export function validateConfig(config: BotConfig): boolean {
  const errors: string[] = [];

  if (!config.discord.token || config.discord.token.length < 50) {
    errors.push('Token de Discord inválido');
  }

  if (!config.discord.baseChannelId || !/^\d{17,20}$/.test(config.discord.baseChannelId)) {
    errors.push('ID de canal base inválido');
  }

  if (config.features.raidProtection.joinLimit < 1) {
    errors.push('Límite de joins debe ser > 0');
  }

  // ⚠️ SEGURIDAD: Forzar intervalos mínimos
  if (config.features.watchdogInterval < 60000) {
    log.warn('⚠️ Watchdog interval ajustado a mínimo 60s por seguridad');
    config.features.watchdogInterval = 60000;
  }

  if (config.features.reconnectDelay < 5000) {
    log.warn('⚠️ Reconnect delay ajustado a mínimo 5s por seguridad');
    config.features.reconnectDelay = 5000;
  }

  if (errors.length > 0) {
    log.error('Errores de configuración:');
    errors.forEach(err => log.error(`  - ${err}`));
    return false;
  }

  return true;
}

export default loadConfig;
