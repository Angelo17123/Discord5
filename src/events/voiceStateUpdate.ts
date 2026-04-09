import { VoiceState } from 'discord.js-selfbot-v13';
import { Event, ExtendedClient } from '../types';
import { log, logVoice, logEvent } from '../utils/logger';
import { exponentialBackoff } from '../utils/safety';

export const voiceStateUpdate: Event = {
  name: 'voiceStateUpdate',
  once: false,
  async execute(client: ExtendedClient, oldState: VoiceState, newState: VoiceState) {
    // Solo procesar nuestro propio estado
    if (newState.member?.id !== client.user?.id) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Desconectado
    if (!newChannel) {
      logVoice('DESCONEXIÓN FORZADA', (oldChannel as any)?.name || 'Desconocido', oldState.guild.name);
      logEvent('VOICE', 'Desconectado del canal de voz');

      // ⚠️ SEGURIDAD: Reconexión con backoff exponencial + jitter
      // NO reconectar inmediatamente - parece automatizado
      const reconnectDelay = exponentialBackoff(0, client.config.features.reconnectDelay);
      log.info(`⏳ Reconectando en ${Math.round(reconnectDelay / 1000)}s...`);
      
      setTimeout(() => {
        client.voiceManager.joinTarget();
      }, reconnectDelay);

      return;
    }

    // Movido a otro canal
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      logVoice('MOVIDO', `${(oldChannel as any).name} → ${(newChannel as any).name}`, newState.guild.name);

      if (newChannel.id !== client.config.discord.baseChannelId) {
        await client.voiceManager.updateTarget(newChannel.id, newState.guild.id);
        log.info(`🔒 Nuevo canal objetivo: ${(newChannel as any).name}`);
      }
      return;
    }

    // Conectado por primera vez
    if (!oldChannel && newChannel) {
      logVoice('CONECTADO', (newChannel as any).name, newState.guild.name);
    }
  },
};

export default voiceStateUpdate;
