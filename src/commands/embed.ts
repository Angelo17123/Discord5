import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { randomDelay } from '../utils/safety';

// ⚠️ SEGURIDAD: El comando embed se mantiene SIMPLIFICADO
// Embeds de usuario (webhook style) son menos sospechosos que MessageEmbed
export const embed: Command = {
  name: 'embed',
  aliases: ['emb'],
  description: 'Envía un mensaje formateado',
  category: 'fun',
  usage: '<mensaje>',
  cooldown: 15,
  async execute(_client: ExtendedClient, message: Message, args: string[]) {
    const text = args.join(' ');

    if (!text) {
      return message.channel.send('❌ Uso: `embed <mensaje>`').then(m => {
        setTimeout(() => m.delete().catch(() => {}), 8000);
      });
    }

    await randomDelay(300, 800);

    // ⚠️ SEGURIDAD: Enviar como texto formateado, NO como embed real
    // Los embeds reales desde cuentas de usuario son una señal ENORME
    return message.channel.send(`>>> ${text}`);
  },
};

export default embed;
