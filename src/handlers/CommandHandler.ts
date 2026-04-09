import { Message } from 'discord.js-selfbot-v13';
import { ExtendedClient, Command } from '../types';
import { logCommand, logError, log } from '../utils/logger';
import { randomDelay, simulateTyping, isActionSafe } from '../utils/safety';
import fs from 'fs';
import path from 'path';

export class CommandHandler {
  private client: ExtendedClient;
  private cooldowns: Map<string, Map<string, number>> = new Map();

  constructor(client: ExtendedClient) {
    this.client = client;
  }

  /**
   * Cargar todos los comandos
   */
  async loadCommands(): Promise<void> {
    const commandsPath = path.join(__dirname, '../commands');

    if (!fs.existsSync(commandsPath)) {
      log.warn('Directorio de comandos no encontrado');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file =>
      (file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts')
    );

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        const commandModule = await import(filePath);
        const command: Command = commandModule.default || commandModule;

        if (!command.name || !command.execute) {
          log.warn(`Comando en ${file} no tiene nombre o execute`);
          continue;
        }

        // Registrar comando
        this.client.commands.set(command.name, command);

        // Registrar aliases
        if (command.aliases) {
          command.aliases.forEach(alias => {
            this.client.aliases.set(alias, command.name);
          });
        }

        log.debug(`Comando cargado: ${command.name}`);
      } catch (error) {
        logError(error as Error, `Cargando comando ${file}`);
      }
    }

    log.info(`${this.client.commands.size} comandos cargados`);
  }

  /**
   * Manejar un mensaje
   */
  async handleMessage(message: Message): Promise<void> {
    // Ignorar mensajes de bots
    if (message.author.bot) return;

    // Solo procesar mensajes propios (selfbot)
    if (message.author.id !== this.client.user?.id) {
      this.processOtherMessages(message);
      return;
    }

    const prefix = this.client.config.discord.commandPrefix;

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    let command = this.client.commands.get(commandName);

    if (!command) {
      const alias = this.client.aliases.get(commandName);
      if (alias) {
        command = this.client.commands.get(alias);
      }
    }

    if (!command) return;

    // ⚠️ SEGURIDAD: Verificar rate limit interno global
    if (!isActionSafe('command_execute', 5)) {
      log.warn('⚠️ Demasiados comandos ejecutados - esperando...');
      return;
    }

    // Verificar cooldown
    if (!this.checkCooldown(command, message)) return;

    // ⚠️ SEGURIDAD: Eliminar el mensaje del comando INMEDIATAMENTE
    // Un usuario normal no deja comandos visibles
    await message.delete().catch(() => {});

    // ⚠️ SEGURIDAD: Delay aleatorio antes de ejecutar
    await randomDelay(300, 1200);

    // Ejecutar comando
    try {
      logCommand(message.author.tag, command.name, args, message.guild?.name);
      this.client.stats.commandsExecuted++;
      await command.execute(this.client, message, args);
    } catch (error) {
      logError(error as Error, `Ejecutando comando ${command.name}`);
      // NO enviar mensaje de error - reduce huella
      log.error(`Error en comando ${command.name}: ${(error as Error).message}`);
    }
  }

  /**
   * Verificar cooldown (con cooldowns MÁS ALTOS para seguridad)
   */
  private checkCooldown(command: Command, message: Message): boolean {
    // ⚠️ SEGURIDAD: Cooldown mínimo de 5 segundos para TODOS los comandos
    const minimumCooldown = 5;
    const effectiveCooldown = Math.max(command.cooldown || 0, minimumCooldown);

    if (!this.cooldowns.has(command.name)) {
      this.cooldowns.set(command.name, new Map());
    }

    const now = Date.now();
    const timestamps = this.cooldowns.get(command.name)!;
    const cooldownAmount = effectiveCooldown * 1000;

    if (timestamps.has(message.author.id)) {
      const expirationTime = timestamps.get(message.author.id)! + cooldownAmount;

      if (now < expirationTime) {
        // ⚠️ SEGURIDAD: NO enviar mensaje de cooldown - reduce huella
        log.debug(`Cooldown activo para ${command.name}: ${((expirationTime - now) / 1000).toFixed(1)}s restantes`);
        return false;
      }
    }

    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    return true;
  }

  /**
   * Procesar mensajes que no son comandos
   */
  private processOtherMessages(message: Message): void {
    // Auto-responder a DMs (con rate limiting)
    if (message.channel.type === 'DM' && this.client.config.features.autoResponder.enabled) {
      this.handleAutoResponder(message);
    }

    // Contar mensajes (pasivo, sin riesgo)
    this.client.stats.messagesReceived++;
    if (message.channel.type === 'DM') {
      this.client.stats.dmsReceived++;
    }

    // ⚠️ SEGURIDAD: Menciones alertas solo por log, no webhook frecuente
    if (message.mentions.has(this.client.user!.id)) {
      this.client.stats.mentionsReceived++;
      log.info(`🔔 Mencionado por ${message.author.tag} en ${message.guild?.name || 'DM'}`);
    }
  }

  /**
   * Auto-responder a DMs (CON PROTECCIONES)
   */
  private async handleAutoResponder(message: Message): Promise<void> {
    const config = this.client.config.features.autoResponder;
    if (!config.enabled) return;

    // ⚠️ SEGURIDAD: Cooldown de 10 minutos por usuario (antes era 5)
    const lastResponse = this.client.cooldowns.get('autoresponder')?.get(message.author.id) || 0;
    const now = Date.now();

    if (now - lastResponse < 600000) return; // 10 minutos

    // ⚠️ SEGURIDAD: Rate limit global para auto-responder
    if (!isActionSafe('auto_respond', 2)) return; // Max 2 por minuto

    try {
      // ⚠️ SEGURIDAD: Simular typing + delay humano
      await simulateTyping(message.channel, config.message);
      await randomDelay(2000, 5000); // 2-5 segundos extra
      
      await message.reply(config.message);

      if (!this.client.cooldowns.has('autoresponder')) {
        this.client.cooldowns.set('autoresponder', new Map());
      }
      this.client.cooldowns.get('autoresponder')!.set(message.author.id, now);

      log.info(`Auto-responder enviado a ${message.author.tag}`);
    } catch (error) {
      log.debug('Error en auto-responder:', error);
    }
  }

  /**
   * Obtener lista de comandos por categoría
   */
  getCommandsByCategory(): Map<string, Command[]> {
    const categories = new Map<string, Command[]>();

    for (const command of this.client.commands.values()) {
      const category = command.category || 'general';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(command);
    }

    return categories;
  }
}

export default CommandHandler;
