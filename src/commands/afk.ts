import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay, simulateTyping } from '../utils/safety';
import { log } from '../utils/logger';

// Mapa de usuarios AFK
const afkUsers = new Map<string, {
  reason: string;
  timestamp: number;
  mentions: number;
}>();

export const afk: Command = {
  name: 'afk',
  aliases: ['away', 'ausente'],
  description: 'Establece tu estado como AFK',
  category: 'utility',
  usage: '[razón]',
  cooldown: 30, // ⚠️ Cooldown alto
  async execute(_client: ExtendedClient, message: Message, args: string[]) {
    const reason = args.join(' ') || 'No especificada';
    const userId = message.author.id;

    if (afkUsers.has(userId)) {
      const afkData = afkUsers.get(userId)!;
      const duration = Date.now() - afkData.timestamp;
      afkUsers.delete(userId);

      // ⚠️ SEGURIDAD: NO cambiar nickname automáticamente
      // Cambios automáticos de nickname son detectables

      await simulateTyping(message.channel, 'Bienvenido de vuelta');
      await randomDelay(500, 1500);

      const msg = await message.channel.send(
        `👋 **De vuelta** | AFK por ${formatDuration(duration)} | ${afkData.mentions} menciones`
      );
      autoDelete(msg, 15000);
      return;
    }

    afkUsers.set(userId, {
      reason,
      timestamp: Date.now(),
      mentions: 0,
    });

    // ⚠️ SEGURIDAD: NO cambiar nickname

    await simulateTyping(message.channel, 'AFK activado');
    await randomDelay(300, 800);

    const msg = await message.channel.send(`💤 **AFK** | Razón: ${reason}`);
    autoDelete(msg, 10000);
    log.info(`[AFK] ${message.author.tag} está ahora AFK: ${reason}`);
  },
};

// Función para verificar menciones AFK
export function checkAfkMention(message: Message): void {
  if (message.author.bot) return;

  const mentionedUsers = message.mentions.users;

  for (const [userId, user] of mentionedUsers) {
    if (afkUsers.has(userId)) {
      const afkData = afkUsers.get(userId)!;
      afkData.mentions++;

      const duration = Date.now() - afkData.timestamp;

      // ⚠️ SEGURIDAD: Delay antes de responder a mención
      setTimeout(async () => {
        const msg = await message.reply(
          `💤 **${user.username}** está AFK: *${afkData.reason}* (hace ${formatDuration(duration)})`
        ).catch(() => null);
        if (msg) autoDelete(msg, 15000);
      }, Math.floor(Math.random() * 3000) + 2000); // 2-5 seg delay
    }
  }
}

// Función para quitar AFK al enviar mensaje
export function removeAfkOnMessage(message: Message): void {
  if (message.author.bot) return;

  const userId = message.author.id;
  if (afkUsers.has(userId)) {
    const afkData = afkUsers.get(userId)!;
    afkUsers.delete(userId);

    // ⚠️ SEGURIDAD: Delay y auto-delete
    setTimeout(async () => {
      const msg = await message.reply(
        `👋 De vuelta! AFK por ${formatDuration(Date.now() - afkData.timestamp)} (${afkData.mentions} menciones)`
      ).catch(() => null);
      if (msg) autoDelete(msg, 8000);
    }, Math.floor(Math.random() * 2000) + 1000);
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

export default afk;
