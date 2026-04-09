import { Message, GuildMember } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay, simulateTyping } from '../utils/safety';

export const userinfo: Command = {
  name: 'userinfo',
  aliases: ['ui', 'whois'],
  description: 'Muestra información sobre un usuario',
  category: 'utility',
  usage: '[@usuario/ID]',
  cooldown: 10,
  async execute(_client: ExtendedClient, message: Message, args: string[]) {
    let target: GuildMember | undefined;

    if (message.mentions.members?.first()) {
      target = message.mentions.members.first();
    } else if (args[0]) {
      try {
        target = await message.guild?.members.fetch(args[0]);
      } catch {}
    }

    if (!target) target = message.member || undefined;
    if (!target) {
      return message.channel.send('❌ Usuario no encontrado');
    }

    await simulateTyping(message.channel, 'Buscando info...');
    await randomDelay(500, 1200);

    const user = target.user;
    const roles = target.roles.cache
      .filter(r => r.id !== message.guild?.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r.name)
      .slice(0, 5);

    // ⚠️ SEGURIDAD: Texto plano, sin embeds
    const msg = await message.channel.send([
      `👤 **${user.tag}**`,
      `> 🆔 ID: ${user.id}`,
      `> 📅 Cuenta: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
      `> 📥 Se unió: <t:${Math.floor(target.joinedTimestamp! / 1000)}:R>`,
      `> 🎭 Roles (${target.roles.cache.size - 1}): ${roles.join(', ') || 'Ninguno'}`,
    ].join('\n'));
    
    autoDelete(msg, 25000);
    return;
  },
};

export default userinfo;
