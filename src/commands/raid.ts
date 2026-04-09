import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay } from '../utils/safety';
import { log } from '../utils/logger';

export const raid: Command = {
  name: 'raid',
  aliases: ['antiraid'],
  description: 'Controla la protección contra raids (SOLO MONITOREO)',
  category: 'moderation',
  usage: '<status/enable/disable>',
  cooldown: 10,
  permissions: 'admin',
  async execute(client: ExtendedClient, message: Message, args: string[]) {
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
      const msg = await message.channel.send('❌ Uso: `raid <status/enable/disable>`');
      autoDelete(msg, 8000);
      return;
    }

    await randomDelay(300, 800);

    switch (subcommand) {
      case 'status': {
        const config = client.config.features.raidProtection;
        // ⚠️ SEGURIDAD: Texto plano, sin embeds
        const msg = await message.channel.send([
          `🛡️ **Anti-Raid** (Solo Monitoreo)`,
          `> Estado: ${config.enabled ? '✅ Activo' : '❌ Inactivo'}`,
          `> Límite: ${config.joinLimit} joins/${config.timeWindow / 1000}s`,
          `> ⚠️ Modo: Solo alertas (no kickea)`
        ].join('\n'));
        autoDelete(msg, 20000);
        break;
      }

      case 'enable':
      case 'on':
        client.config.features.raidProtection.enabled = true;
        const onMsg = await message.channel.send('✅ Monitoreo anti-raid **activado** (solo alertas)');
        autoDelete(onMsg, 10000);
        log.info(`[RAID] Monitoreo activado por ${message.author.tag}`);
        break;

      case 'disable':
      case 'off':
        client.config.features.raidProtection.enabled = false;
        const offMsg = await message.channel.send('✅ Monitoreo anti-raid **desactivado**');
        autoDelete(offMsg, 10000);
        log.info(`[RAID] Monitoreo desactivado por ${message.author.tag}`);
        break;

      default:
        const defMsg = await message.channel.send('❌ Subcomando no válido');
        autoDelete(defMsg, 8000);
    }
    return;
  },
};

export default raid;
