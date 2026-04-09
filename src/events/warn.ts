import { Event, ExtendedClient } from '../types';
import { log } from '../utils/logger';

export const warn: Event = {
  name: 'warn',
  once: false,
  async execute(_client: ExtendedClient, info: string) {
    log.warn(`[Discord Warning] ${info}`);
  },
};

export default warn;
