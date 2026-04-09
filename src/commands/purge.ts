import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { randomDelay, isActionSafe } from '../utils/safety';

export const purge: Command = {
  name: 'purge',
  aliases: ['clear', 'limpiar'],
  description: 'Elimina tus mensajes recientes',
  category: 'utility',
  usage: '[cantidad]',
  cooldown: 30, // ⚠️ Cooldown MUY alto
  async execute(client: ExtendedClient, message: Message, args: string[]) {
    // ⚠️ SEGURIDAD: Máximo 15 mensajes (antes era 100)
    const amount = Math.min(parseInt(args[0]) || 5, 15);

    if (amount < 1) {
      return message.channel.send('❌ Cantidad mínima: 1');
    }

    if (message.channel.type === 'DM') {
      return message.channel.send('❌ No funciona en DMs');
    }

    // ⚠️ SEGURIDAD: Rate limit para purge
    if (!isActionSafe('purge', 1)) { // Max 1 purge por minuto
      return;
    }

    try {
      const channel = message.channel as any;
      const messages = await channel.messages.fetch({ limit: 50 });
      const userMessages = messages.filter((m: any) => m.author.id === client.user?.id);
      const messagesToDelete = Array.from(userMessages.values()).slice(0, amount);

      let deleted = 0;
      for (const msg of messagesToDelete) {
        try {
          await (msg as any).delete();
          deleted++;
          // ⚠️ SEGURIDAD: Delay de 2-4 segundos entre eliminaciones (parece humano)
          await randomDelay(2000, 4000);
        } catch {
          // Ignorar
        }
      }

      const confirmation = await channel.send(`✅ Eliminados **${deleted}** mensajes`);
      setTimeout(() => confirmation.delete().catch(() => {}), 5000);
    } catch {
      // ⚠️ SEGURIDAD: NO enviar mensaje de error
    }
    return;
  },
};

export default purge;
