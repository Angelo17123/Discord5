import { Event, ExtendedClient } from '../types';
import { logError, logEvent } from '../utils/logger';

export const error: Event = {
  name: 'error',
  once: false,
  async execute(client: ExtendedClient, error: Error) {
    logError(error, 'Discord Client');
    client.stats.errors++;
    client.stats.lastError = error.message;
    client.stats.lastErrorTime = new Date();
    logEvent('ERROR', error.message);
  },
};

export default error;
