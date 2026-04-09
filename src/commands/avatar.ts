import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay } from '../utils/safety';

export const avatar: Command = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  description: 'Muestra el avatar de un usuario',
  category: 'utility',
  usage: '[@usuario/ID]',
  cooldown: 10,
  async execute(client: ExtendedClient, message: Message, args: string[]) {
    let target = message.mentions.users.first();

    if (!target) {
      if (args[0]) {
        try {
          target = await client.users.fetch(args[0]);
        } catch {
          // Usuario no encontrado
        }
      }
    }

    if (!target) target = message.author;

    await randomDelay(300, 800);

    const avatarURL = target.displayAvatarURL({ size: 4096, dynamic: true });

    // ⚠️ SEGURIDAD: Texto plano con link, sin embeds
    const msg = await message.channel.send(
      `🖼️ **Avatar de ${target.tag}**\n${avatarURL}`
    );
    autoDelete(msg, 30000);
  },
};

export default avatar;
