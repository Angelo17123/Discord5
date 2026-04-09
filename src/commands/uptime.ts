import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay } from '../utils/safety';

export const uptime: Command = {
  name: 'uptime',
  aliases: ['up'],
  description: 'Muestra el tiempo de actividad',
  category: 'general',
  cooldown: 10,
  async execute(client: ExtendedClient, message: Message) {
    await randomDelay(300, 800);

    const botUptime = client.uptime || 0;

    const msg = await message.channel.send([
      `⏱️ **Uptime**`,
      `> 🤖 Bot: ${formatDuration(botUptime)}`,
      `> 📅 Desde: <t:${Math.floor((Date.now() - botUptime) / 1000)}:R>`,
    ].join('\n'));
    
    autoDelete(msg, 20000);
  },
};

function formatDuration(ms: number): string {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor((ms / (1000 * 60)) % 60);
  const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const d = Math.floor(ms / (1000 * 60 * 60 * 24));
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default uptime;
