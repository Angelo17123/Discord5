import { Guild, GuildMember } from 'discord.js-selfbot-v13';
import { ExtendedClient, RaidProtectionManager as IRaidProtectionManager } from '../types';
import { log } from '../utils/logger';

export class RaidProtection implements IRaidProtectionManager {
  public joinHistory: Map<string, number[]> = new Map();
  public isLocked: boolean = false;
  private client: ExtendedClient;
  private lockTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(client: ExtendedClient) {
    this.client = client;
  }

  checkRaid(guildId: string, _userId: string): boolean {
    if (!this.client.config.features.raidProtection.enabled) return false;
    if (this.isLocked) return true;

    const now = Date.now();
    const config = this.client.config.features.raidProtection;

    // Obtener historial de joins para este guild
    let history = this.joinHistory.get(guildId) || [];

    // Limpiar entradas antiguas
    history = history.filter(timestamp => now - timestamp < config.timeWindow);

    // Agregar nuevo join
    history.push(now);
    this.joinHistory.set(guildId, history);

    // Verificar si se excedió el límite
    if (history.length >= config.joinLimit) {
      this.triggerRaidLock(guildId);
      return true;
    }

    return false;
  }

  /**
   * Activar bloqueo de raid
   */
  private triggerRaidLock(guildId: string): void {
    if (this.isLocked) return;

    this.isLocked = true;
    log.warn(`🚨 RAID DETECTADO en guild ${guildId} - Bloqueando servidor`);

    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      this.notifyRaidDetection(guild);
    }

    // Auto-desbloqueo después de 5 minutos
    const timeout = setTimeout(() => {
      this.unlockGuild(guildId);
    }, 300000);

    this.lockTimeouts.set(guildId, timeout);
  }

  /**
   * Desbloquear guild
   */
  unlockGuild(guildId: string): void {
    this.isLocked = false;
    this.joinHistory.delete(guildId);

    const timeout = this.lockTimeouts.get(guildId);
    if (timeout) {
      clearTimeout(timeout);
      this.lockTimeouts.delete(guildId);
    }

    log.info(`Guild ${guildId} desbloqueado`);
  }

  /**
   * Bloquear guild manualmente
   */
  lockGuild(_guildId: string): void {
    this.isLocked = true;
  }

  /**
   * Verificar si un usuario debe ser kickeado por raid
   */
  shouldKick(member: GuildMember): boolean {
    if (!this.isLocked) return false;

    // No kickear a usuarios con roles o cuentas antiguas
    if (member.roles.cache.size > 1) return false;
    if (Date.now() - member.user.createdTimestamp < 86400000) return true;

    return false;
  }

  /**
   * Obtener estadísticas de joins
   */
  getStats(guildId: string): {
    joinsInWindow: number;
    isLocked: boolean;
    timeWindow: number;
    joinLimit: number;
  } {
    const history = this.joinHistory.get(guildId) || [];
    return {
      joinsInWindow: history.length,
      isLocked: this.isLocked,
      timeWindow: this.client.config.features.raidProtection.timeWindow,
      joinLimit: this.client.config.features.raidProtection.joinLimit,
    };
  }

  /**
   * Notificar detección de raid
   */
  private async notifyRaidDetection(guild: Guild): Promise<void> {
    const webhookUrl = this.client.config.notifications.webhookUrl;
    if (!webhookUrl) return;

    try {
      const axios = await import('axios');
      await axios.default.post(webhookUrl, {
        event: 'raid_detected',
        data: {
          guild: guild.name,
          guildId: guild.id,
          joinsInWindow: this.joinHistory.get(guild.id)?.length || 0,
          timestamp: new Date().toISOString(),
        },
        bot: this.client.user?.tag,
      });
    } catch (error: unknown) {
      log.debug('Error enviando webhook de raid:', error);
    }
  }

  /**
   * Limpiar historial antiguo periódicamente
   */
  startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 60000; // 1 minuto

      for (const [guildId, history] of this.joinHistory.entries()) {
        const filtered = history.filter(timestamp => now - timestamp < maxAge);
        if (filtered.length === 0) {
          this.joinHistory.delete(guildId);
        } else {
          this.joinHistory.set(guildId, filtered);
        }
      }
    }, 30000);

    log.info('Sistema de limpieza de raid protection iniciado');
  }
}

export default RaidProtection;
