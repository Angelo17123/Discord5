import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, randomDelay } from '../utils/safety';
import util from 'util';

export const evalCmd: Command = {
  name: 'eval',
  aliases: ['e'],
  description: 'Ejecuta código JavaScript (solo owner)',
  category: 'developer',
  usage: '<código>',
  cooldown: 10,
  permissions: 'owner',
  async execute(_client: ExtendedClient, message: Message, args: string[]) {
    if (!args.length) {
      const msg = await message.channel.send('❌ Proporciona código');
      autoDelete(msg, 5000);
      return;
    }

    const code = args.join(' ');

    // ⚠️ SEGURIDAD: Bloquear acceso al token en eval
    if (code.toLowerCase().includes('token') || code.toLowerCase().includes('.env')) {
      const msg = await message.channel.send('🔒 Acceso denegado por seguridad');
      autoDelete(msg, 5000);
      return;
    }

    await randomDelay(200, 600);

    try {
      const start = Date.now();
      let result = eval(code);
      if (result instanceof Promise) result = await result;
      const executionTime = Date.now() - start;

      let output: string;
      if (typeof result === 'object') {
        output = util.inspect(result, { depth: 1, showHidden: false });
      } else {
        output = String(result);
      }

      // ⚠️ SEGURIDAD: Filtrar token del output
      const token = process.env.DISCORD_TOKEN || '';
      if (token) {
        output = output.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[TOKEN_REDACTED]');
      }

      if (output.length > 500) output = output.slice(0, 500) + '...';

      const msg = await message.channel.send(
        `✅ **Eval** (${executionTime}ms)\n\`\`\`js\n${output}\n\`\`\``
      );
      autoDelete(msg, 30000);
    } catch (error: unknown) {
      const msg = await message.channel.send(
        `❌ **Error**\n\`\`\`\n${(error as Error).message}\n\`\`\``
      );
      autoDelete(msg, 15000);
    }
    return;
  },
};

export default evalCmd;
