import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { log } from '../utils/logger';

export const restart: Command = {
  name: 'restart',
  aliases: ['reboot'],
  description: 'Reinicia el bot',
  category: 'developer',
  cooldown: 30,
  permissions: 'owner',
  async execute(client: ExtendedClient, message: Message) {
    await message.channel.send('🔄 Reiniciando...');
    log.info(`[RESTART] Bot reiniciado por ${message.author.tag}`);
    await client.destroy();
    process.exit(0);
  },
};

export default restart;
