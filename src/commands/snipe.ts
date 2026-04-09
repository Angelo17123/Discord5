import { Message, TextChannel } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay } from '../utils/safety';

const deletedMessages = new Map<string, {
  content: string;
  author: string;
  timestamp: number;
}>();

const MAX_STORED = 5; // ⚠️ Reducido

export const snipe: Command = {
  name: 'snipe',
  aliases: ['s'],
  description: 'Muestra el último mensaje borrado',
  category: 'utility',
  usage: '[número]',
  cooldown: 10,
  async execute(_client: ExtendedClient, message: Message, args: string[]) {
    if (message.channel.type === 'DM') {
      return message.channel.send('❌ No funciona en DMs');
    }

    const channel = message.channel as TextChannel;
    const index = parseInt(args[0]) || 1;

    if (index < 1 || index > MAX_STORED) {
      return message.channel.send(`❌ Rango: 1-${MAX_STORED}`);
    }

    await randomDelay(300, 800);

    const channelMessages: [string, any][] = [];
    for (const [key, value] of deletedMessages) {
      if (key.startsWith(channel.id)) {
        channelMessages.push([key, value]);
      }
    }

    channelMessages.sort((a, b) => b[1].timestamp - a[1].timestamp);

    if (channelMessages.length === 0 || index > channelMessages.length) {
      const msg = await message.channel.send('❌ No hay mensajes borrados');
      autoDelete(msg, 8000);
      return;
    }

    const sniped = channelMessages[index - 1][1];

    // ⚠️ SEGURIDAD: Texto plano
    const msg = await message.channel.send([
      `🎯 **Mensaje Borrado** (${index}/${channelMessages.length})`,
      `> 👤 ${sniped.author}`,
      `> 💬 ${sniped.content || '*Sin contenido*'}`,
      `> 🕐 <t:${Math.floor(sniped.timestamp / 1000)}:R>`,
    ].join('\n'));
    
    autoDelete(msg, 20000);
    return;
  },
};

export function storeDeletedMessage(message: Message): void {
  if (message.author.bot) return;
  if (message.channel.type === 'DM') return;

  const channel = message.channel as TextChannel;
  const key = `${channel.id}-${message.id}`;

  deletedMessages.set(key, {
    content: message.content,
    author: message.author.tag,
    timestamp: message.createdTimestamp,
  });

  // Limpiar
  const channelKeys: string[] = [];
  for (const k of deletedMessages.keys()) {
    if (k.startsWith(channel.id)) channelKeys.push(k);
  }

  if (channelKeys.length > MAX_STORED) {
    channelKeys
      .sort((a, b) => {
        const timeA = deletedMessages.get(a)?.timestamp || 0;
        const timeB = deletedMessages.get(b)?.timestamp || 0;
        return timeA - timeB;
      })
      .slice(0, channelKeys.length - MAX_STORED)
      .forEach(k => deletedMessages.delete(k));
  }

  // Limpiar mensajes > 30 minutos
  const thirtyMinAgo = Date.now() - 1800000;
  for (const [k, v] of deletedMessages) {
    if (v.timestamp < thirtyMinAgo) deletedMessages.delete(k);
  }
}

export default snipe;
