import { Message } from 'discord.js-selfbot-v13';
import { Event, ExtendedClient } from '../types';

export const messageCreate: Event = {
  name: 'messageCreate',
  once: false,
  async execute(client: ExtendedClient, message: Message) {
    await client.commandHandler.handleMessage(message);
  },
};

export default messageCreate;
