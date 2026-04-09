import { ExtendedClient, Event } from '../types';
import { log, logError } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class EventHandler {
  private client: ExtendedClient;

  constructor(client: ExtendedClient) {
    this.client = client;
  }

  /**
   * Cargar todos los eventos
   */
  async loadEvents(): Promise<void> {
    const eventsPath = path.join(__dirname, '../events');

    if (!fs.existsSync(eventsPath)) {
      log.warn('Directorio de eventos no encontrado');
      return;
    }

    const eventFiles = fs.readdirSync(eventsPath).filter(file =>
      (file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts')
    );

    for (const file of eventFiles) {
      try {
        const filePath = path.join(eventsPath, file);
        const eventModule = await import(filePath);
        const event: Event = eventModule.default || eventModule;

        if (!event.name || !event.execute) {
          log.warn(`Evento en ${file} no tiene nombre o execute`);
          continue;
        }

        // Registrar evento
        if (event.once) {
          this.client.once(event.name, (...args) => event.execute(this.client, ...args));
        } else {
          this.client.on(event.name, (...args) => event.execute(this.client, ...args));
        }

        log.debug(`Evento cargado: ${event.name}`);
      } catch (error) {
        logError(error as Error, `Cargando evento ${file}`);
      }
    }

    log.info(`${eventFiles.length} eventos cargados`);
  }

  /**
   * Registrar evento personalizado
   */
  registerEvent(event: Event): void {
    if (event.once) {
      this.client.once(event.name, (...args) => event.execute(this.client, ...args));
    } else {
      this.client.on(event.name, (...args) => event.execute(this.client, ...args));
    }
  }

  /**
   * Remover evento
   */
  removeEvent(eventName: string): void {
    this.client.removeAllListeners(eventName);
  }
}

export default EventHandler;
