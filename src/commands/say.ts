import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { randomDelay, simulateTyping } from '../utils/safety';

export const say: Command = {
  name: 'say',
  aliases: ['decir'],
  description: 'Envía un mensaje',
  category: 'fun',
  usage: '<mensaje>',
  cooldown: 8,
  async execute(_client: ExtendedClient, message: Message, args: string[]) {
    const text = args.join(' ');

    if (!text) {
      return message.channel.send('❌ Proporciona un mensaje');
    }

    // ⚠️ SEGURIDAD: Simular typing antes de enviar
    await simulateTyping(message.channel, text);
    await randomDelay(300, 1000);

    return message.channel.send(text);
  },
};

export default say;
