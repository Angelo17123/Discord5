import { VoiceChannel } from 'discord.js-selfbot-v13';
import { ExtendedClient, VoiceManager as IVoiceManager } from '../types';
import { logVoice, logError, log } from '../utils/logger';

export class VoiceManager implements IVoiceManager {
  public targetChannelId: string | null = null;
  public targetGuildId: string | null = null;
  public isConnecting: boolean = false;
  public connectionStartTime: Date | null = null;
  private client: ExtendedClient;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.targetChannelId = client.config.discord.baseChannelId;
  }

  /**
   * Conectar al canal objetivo
   */
  async joinTarget(): Promise<void> {
    if (this.isConnecting || !this.targetGuildId) {
      log.debug('Conexión ignorada: ya conectando o sin guild objetivo');
      return;
    }

    this.isConnecting = true;

    try {
      const guild = await this.client.guilds.fetch(this.targetGuildId).catch(() => null);
      if (!guild) {
        log.warn(`Guild ${this.targetGuildId} no encontrado`);
        this.isConnecting = false;
        return;
      }

      const channel = await this.client.channels.fetch(this.targetChannelId!).catch(() => null);
      if (!channel || channel.type !== 'GUILD_VOICE') {
        log.warn(`Canal ${this.targetChannelId} no encontrado o no es de voz`);
        this.isConnecting = false;
        return;
      }

      const voiceChannel = channel as VoiceChannel;

      // Intentar conectar sin verificar permisos (forzar conexión)
      try {
        // Conectar usando la API del selfbot
        await this.client.voice.joinChannel(voiceChannel, {
          selfMute: true,
          selfDeaf: false,
        });

        this.connectionStartTime = new Date();
        this.reconnectAttempts = 0;
        this.client.stats.voiceConnections++;

        logVoice('CONECTADO', voiceChannel.name, guild.name);

        // Notificar por webhook si está configurado
        this.notifyWebhook('voice_join', {
          channel: voiceChannel.name,
          guild: guild.name,
          timestamp: new Date().toISOString(),
        });
      } catch (voiceError) {
        // Si falla por permisos u otro error, solo warn y NO reconectar
        log.warn(`No se pudo conectar a ${voiceChannel.name}: ${(voiceError as Error).message}`);
      }

    } catch (error) {
      logError(error as Error, 'VoiceManager.joinTarget');
      // Solo reconectar si es un error crítico (guild o canal no encontrado)
      const errMsg = (error as Error).message;
      if (errMsg.includes('Guild') || errMsg.includes('Channel') || errMsg.includes('not found')) {
        this.handleReconnect();
      }
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Desconectar del canal de voz actual
   */
  async leaveChannel(): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(this.targetGuildId!);
      if (!guild) return;

      const connection = guild.voiceStates.cache.get(this.client.user!.id);
      if (connection?.channel) {
        const channelName = (connection.channel as any).name;
        await (connection.channel as any).leave();
        logVoice('DESCONECTADO', channelName, guild.name);
      }

      this.connectionStartTime = null;
    } catch (error) {
      logError(error as Error, 'VoiceManager.leaveChannel');
    }
  }

  /**
   * Moverse a otro canal
   */
  async moveToChannel(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== 'GUILD_VOICE') {
        log.warn(`Canal ${channelId} no válido`);
        return;
      }

      const voiceChannel = channel as VoiceChannel;
      this.targetChannelId = channelId;
      this.targetGuildId = voiceChannel.guildId;

      await this.leaveChannel();
      await this.joinTarget();

      log.info(`Canal objetivo actualizado a: ${voiceChannel.name}`);
    } catch (error) {
      logError(error as Error, 'VoiceManager.moveToChannel');
    }
  }

  /**
   * Actualizar canal objetivo (cuando te mueven)
   */
  async updateTarget(channelId: string, guildId: string): Promise<void> {
    if (channelId !== this.targetChannelId) {
      this.targetChannelId = channelId;
      this.targetGuildId = guildId;
      this.reconnectAttempts = 0;
      
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      const channelName = (channel as any)?.name || channelId;
      log.info(`🔒 Nuevo canal objetivo: ${channelName}`);
      
      // Desconectar del canal anterior y conectarse al nuevo
      await this.leaveChannel();
      
      // Delay antes de conectar al nuevo canal
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.joinTarget();
    }
  }

  /**
   * Manejar reconexión automática
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Máximo de intentos de reconexión alcanzado');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.client.config.features.reconnectDelay * this.reconnectAttempts;

    log.warn(`Reintentando conexión en ${delay}ms (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.client.stats.reconnections++;
      this.joinTarget();
    }, delay);
  }

  /**
   * Obtener tiempo de conexión en segundos
   */
  getConnectionTime(): number {
    if (!this.connectionStartTime) return 0;
    return Math.floor((Date.now() - this.connectionStartTime.getTime()) / 1000);
  }

  /**
   * Verificar si está conectado al canal objetivo
   */
  isConnectedToTarget(): boolean {
    if (!this.targetGuildId || !this.targetChannelId) return false;

    const guild = this.client.guilds.cache.get(this.targetGuildId);
    if (!guild) return false;

    const voiceState = guild.voiceStates.cache.get(this.client.user!.id);
    return voiceState?.channelId === this.targetChannelId;
  }

  /**
   * Obtener información del estado de voz actual
   */
  getStatus(): {
    connected: boolean;
    channel: string | null;
    guild: string | null;
    connectionTime: number;
  } {
    const guild = this.targetGuildId ? this.client.guilds.cache.get(this.targetGuildId) : null;
    const voiceState = guild?.voiceStates.cache.get(this.client.user!.id);

    return {
      connected: this.isConnectedToTarget(),
      channel: (voiceState?.channel as any)?.name || null,
      guild: guild?.name || null,
      connectionTime: this.getConnectionTime(),
    };
  }

  /**
   * Notificar por webhook
   */
  private async notifyWebhook(event: string, data: any): Promise<void> {
    const webhookUrl = this.client.config.notifications.webhookUrl;
    if (!webhookUrl) return;

    try {
      const axios = await import('axios');
      await axios.default.post(webhookUrl, {
        event,
        data,
        bot: this.client.user?.tag,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      log.debug('Error enviando webhook:', error);
    }
  }

  /**
   * Iniciar watchdog para verificar conexión
   */
  startWatchdog(): void {
    const interval = this.client.config.features.watchdogInterval;

    setInterval(async () => {
      if (!this.targetGuildId || !this.targetChannelId) return;

      // NO reconectar si no hay permisos - solo warn una vez
      const isConnected = this.isConnectedToTarget();

      if (!isConnected && !this.isConnecting) {
        // Solo warnear sin reconectar - el usuario debe dar permisos manualmente
        log.debug('[WATCHDOG] Sin conexión al canal objetivo');
      }
    }, interval);

    log.info(`Watchdog iniciado (intervalo: ${interval}ms)`);
  }
}

export default VoiceManager;
