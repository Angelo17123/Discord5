import { Message } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';
import { autoDelete, simulateTyping, randomDelay } from '../utils/safety';

export const help: Command = {
  name: 'help',
  aliases: ['h', 'cmds'],
  description: 'Muestra la lista de comandos disponibles',
  category: 'general',
  usage: '[comando]',
  cooldown: 10,
  async execute(client: ExtendedClient, message: Message, args: string[]) {
    const prefix = client.config.discord.commandPrefix;

    await simulateTyping(message.channel, 'Mostrando ayuda...');
    await randomDelay(400, 1000);

    if (args.length > 0) {
      const commandName = args[0].toLowerCase();
      const command = client.commands.get(commandName) ||
        client.commands.get(client.aliases.get(commandName) || '');

      if (!command) {
        const msg = await message.channel.send(`❌ Comando \`${commandName}\` no encontrado`);
        autoDelete(msg, 10000);
        return;
      }

      // ⚠️ SEGURIDAD: Texto plano, sin embeds
      const response = [
        `📖 **Ayuda: ${command.name}**`,
        `> ${command.description}`,
        `> 📝 Uso: \`${prefix}${command.name} ${command.usage || ''}\``,
        `> 🏷️ Categoría: ${command.category || 'general'}`,
        command.aliases?.length ? `> 🔁 Alias: ${command.aliases.map(a => `\`${a}\``).join(', ')}` : '',
      ].filter(Boolean).join('\n');

      const msg = await message.channel.send(response);
      autoDelete(msg, 25000);
      return;
    }

    const categories = client.commandHandler.getCommandsByCategory();
    let response = `🤖 **Comandos** | Usa \`${prefix}help [cmd]\` para más info\n\n`;

    for (const [category, commands] of categories) {
      const commandList = commands.map((cmd: any) => `\`${cmd.name}\``).join(' ');
      response += `📁 **${category.charAt(0).toUpperCase() + category.slice(1)}**: ${commandList}\n`;
    }

    const msg = await message.channel.send(response);
    autoDelete(msg, 30000);
  },
};

export default help;
