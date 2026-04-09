import { Event, ExtendedClient } from '../types';
import { log, logEvent } from '../utils/logger';
import chalk from 'chalk';

export const ready: Event = {
  name: 'ready',
  once: true,
  async execute(client: ExtendedClient) {
    log.ready(`🔒 Cliente listo como ${chalk.cyan.bold(client.user?.tag)}`);
    log.info(`📊 ID: ${client.user?.id}`);
    log.info(`🌐 Guilds: ${client.guilds.cache.size}`);

    // Buscar el guild del canal base
    try {
      const baseChannel = await client.channels.fetch(client.config.discord.baseChannelId);
      if (baseChannel) {
        client.voiceManager.targetGuildId = (baseChannel as any).guildId;
        log.info(`🏠 Guild base: ${(baseChannel as any).guild?.name || 'Desconocido'}`);

        // ⚠️ SEGURIDAD: Delay antes de conectar a voz (parece más natural)
        const startDelay = Math.floor(Math.random() * 5000) + 3000; // 3-8 segundos
        log.info(`⏳ Conectando a voz en ${startDelay}ms...`);
        
        setTimeout(async () => {
          await client.voiceManager.joinTarget();
          client.voiceManager.startWatchdog();
        }, startDelay);
      }
    } catch (error) {
      log.warn('No se pudo obtener información del canal base');
    }

    // Iniciar protección contra raids (SOLO MONITOREO, sin kicks)
    if (client.config.features.raidProtection.enabled) {
      client.raidProtection.startCleanup();
    }

    // ============================================
    // ⚠️ SEGURIDAD CRÍTICA: NO establecer presencia personalizada
    // ============================================
    // Establecer presencia que NO levante sospechas
    // Un usuario normal simplemente está "online" sin actividad especial
    client.user?.setPresence({
      status: 'online',
      activities: [], // ¡¡SIN actividad que diga "selfbot"!!
    });

    logEvent('READY', 'Bot completamente iniciado (modo stealth)');
  },
};

export default ready;
