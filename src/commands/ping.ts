import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { randomDelay, autoDelete, simulateTyping } from '../utils/safety';

export const ping: Command = {
  name: 'ping',
  aliases: ['latency', 'ms'],
  description: 'Muestra la latencia del bot',
  category: 'general',
  cooldown: 10, // ⚠️ Cooldown aumentado
  async execute(client: ExtendedClient, message: Message) {
    // ⚠️ SEGURIDAD: Simular typing + delay humano
    await simulateTyping(message.channel, 'Calculando latencia...');
    await randomDelay(500, 1500);

    const start = Date.now();
    const sent = await message.channel.send('🏓 Calculando...');
    const latency = Date.now() - start;
    const apiLatency = Math.round(client.ws.ping);

    // ⚠️ SEGURIDAD: Usar texto plano, NO embeds
    const response = [
      `🏓 **Pong!**`,
      `> 📡 Latencia: **${latency}ms**`,
      `> 🔌 API: **${apiLatency}ms**`,
    ].join('\n');

    await sent.edit(response);
    
    // ⚠️ SEGURIDAD: Auto-eliminar después de 20 segundos
    autoDelete(sent, 20000);
  },
};

export default ping;
