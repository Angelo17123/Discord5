import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay } from '../utils/safety';

export const voice: Command = {
  name: 'voice',
  aliases: ['vc'],
  description: 'Controla la conexión de voz',
  category: 'voice',
  usage: '<join/leave/status/move>',
  cooldown: 10,
  async execute(client: ExtendedClient, message: Message, args: string[]) {
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      const msg = await message.channel.send('❌ Uso: `voice <join/leave/status>`');
      autoDelete(msg, 8000);
      return;
    }

    await randomDelay(300, 800);

    switch (sub) {
      case 'join': {
        if (!client.voiceManager.targetChannelId) {
          const msg = await message.channel.send('❌ No hay canal objetivo');
          autoDelete(msg, 8000);
          return;
        }
        const msg = await message.channel.send('🔊 Conectando...');
        autoDelete(msg, 5000);
        // ⚠️ SEGURIDAD: Delay antes de conectar
        await randomDelay(1000, 3000);
        await client.voiceManager.joinTarget();
        break;
      }

      case 'leave': {
        await client.voiceManager.leaveChannel();
        const msg = await message.channel.send('👋 Desconectado');
        autoDelete(msg, 8000);
        break;
      }

      case 'status': {
        const status = client.voiceManager.getStatus();
        const msg = await message.channel.send([
          `🔊 **Estado de Voz**`,
          `> 📡 ${status.connected ? '✅ Conectado' : '❌ Desconectado'}`,
          `> 📻 Canal: ${status.channel || 'Ninguno'}`,
          `> 🏠 Servidor: ${status.guild || 'Ninguno'}`,
        ].join('\n'));
        autoDelete(msg, 20000);
        break;
      }

      case 'move': {
        const channelInput = args.slice(1).join(' ');
        if (!channelInput) {
          const msg = await message.channel.send('❌ Especifica un canal');
          autoDelete(msg, 8000);
          return;
        }
        const channel = message.guild?.channels.cache.find(
          ch => (ch as any).name.toLowerCase().includes(channelInput.toLowerCase()) && ch.type === 'GUILD_VOICE'
        );
        if (!channel) {
          const msg = await message.channel.send('❌ Canal no encontrado');
          autoDelete(msg, 8000);
          return;
        }
        await randomDelay(1000, 2000);
        await client.voiceManager.moveToChannel(channel.id);
        const msg = await message.channel.send(`🔊 Moviendo a: **${(channel as any).name}**`);
        autoDelete(msg, 10000);
        break;
      }

      default: {
        const msg = await message.channel.send('❌ Subcomando no válido');
        autoDelete(msg, 8000);
      }
    }
    return;
  },
};

export default voice;
