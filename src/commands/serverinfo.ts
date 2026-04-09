import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay, simulateTyping } from '../utils/safety';

export const serverinfo: Command = {
  name: 'serverinfo',
  aliases: ['si', 'server'],
  description: 'Muestra información sobre el servidor',
  category: 'utility',
  cooldown: 15,
  async execute(_client: ExtendedClient, message: Message) {
    if (!message.guild) {
      return message.channel.send('❌ Solo funciona en servidores');
    }

    await simulateTyping(message.channel, 'Obteniendo info...');
    await randomDelay(500, 1500);

    const guild = message.guild;
    const memberCount = guild.memberCount;
    const textChannels = guild.channels.cache.filter(c => c.type === 'GUILD_TEXT').size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 'GUILD_VOICE').size;
    const roleCount = guild.roles.cache.size;
    const boostCount = guild.premiumSubscriptionCount || 0;

    // ⚠️ SEGURIDAD: Texto plano, sin embeds
    const response = [
      `🏠 **${guild.name}**`,
      `> 🆔 ID: ${guild.id}`,
      `> 👑 Dueño: <@${guild.ownerId}>`,
      `> 👥 Miembros: ${memberCount}`,
      `> 📺 Canales: ${textChannels} texto / ${voiceChannels} voz`,
      `> 🎭 Roles: ${roleCount}`,
      `> 💎 Boosts: ${boostCount}`,
      `> 📅 Creado: <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
    ].join('\n');

    const msg = await message.channel.send(response);
    autoDelete(msg, 30000);
    return;
  },
};

export default serverinfo;
