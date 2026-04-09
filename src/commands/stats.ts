import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay, simulateTyping } from '../utils/safety';
import os from 'os';

export const stats: Command = {
  name: 'stats',
  aliases: ['info', 'botinfo'],
  description: 'Muestra estadísticas',
  category: 'general',
  cooldown: 15,
  async execute(client: ExtendedClient, message: Message) {
    await simulateTyping(message.channel, 'Obteniendo estadísticas...');
    await randomDelay(500, 1200);

    const s = client.stats;
    const uptime = client.uptime || 0;
    const memory = process.memoryUsage();

    // ⚠️ SEGURIDAD: Texto plano, info mínima
    const msg = await message.channel.send([
      `📊 **Estadísticas**`,
      `> ⏱️ Uptime: ${formatUptime(uptime)}`,
      `> 📈 Comandos: ${s.commandsExecuted}`,
      `> 💬 Mensajes: ${s.messagesReceived}`,
      `> 💾 RAM: ${formatBytes(memory.heapUsed)}`,
      `> 🌐 Servidores: ${client.guilds.cache.size}`,
      `> ❌ Errores: ${s.errors}`,
    ].join('\n'));
    
    autoDelete(msg, 25000);
  },
};

function formatUptime(ms: number): string {
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default stats;
