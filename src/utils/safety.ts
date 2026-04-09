/**
 * ============================================
 * MÓDULO DE SEGURIDAD ANTI-DETECCIÓN
 * ============================================
 * Funciones para simular comportamiento humano
 * y evitar la detección por parte de Discord.
 */

/**
 * Genera un delay aleatorio entre min y max milisegundos
 * Simula el tiempo que un humano tardaría en responder
 */
export function randomDelay(min: number = 800, max: number = 2500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Simula escritura humana - delay basado en la longitud del texto
 * ~40-80ms por caracter (velocidad de escritura humana promedio)
 */
export function typingDelay(textLength: number): Promise<void> {
  const msPerChar = Math.floor(Math.random() * 40) + 40; // 40-80ms por caracter
  const baseDelay = Math.min(textLength * msPerChar, 8000); // máximo 8 segundos
  const jitter = Math.floor(Math.random() * 500); // ±500ms de variación
  return new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
}

/**
 * Simula el indicador "escribiendo..." antes de enviar un mensaje
 */
export async function simulateTyping(channel: any, text: string): Promise<void> {
  try {
    // Iniciar indicador de escritura
    await channel.sendTyping?.();
    // Esperar un tiempo proporcional al texto
    await typingDelay(Math.min(text.length, 100));
  } catch {
    // Ignorar errores de typing - no es crítico
  }
}

/**
 * Auto-eliminar un mensaje después de un tiempo
 * Reduce la huella del selfbot
 */
export function autoDelete(message: any, delayMs: number = 15000): void {
  setTimeout(() => {
    message?.delete?.().catch(() => {});
  }, delayMs);
}

/**
 * Genera un jitter aleatorio para operaciones periódicas
 * Evita patrones regulares detectables
 */
export function jitteredInterval(baseMs: number): number {
  const jitter = Math.floor(Math.random() * baseMs * 0.4); // ±20% del base
  return baseMs + jitter - (baseMs * 0.2);
}

/**
 * Verifica si es seguro ejecutar una acción basándose en rate limits internos
 */
const actionTimestamps = new Map<string, number[]>();

export function isActionSafe(actionType: string, maxPerMinute: number = 3): boolean {
  const now = Date.now();
  const timestamps = actionTimestamps.get(actionType) || [];
  
  // Limpiar timestamps viejos (último minuto)
  const recent = timestamps.filter(t => now - t < 60000);
  actionTimestamps.set(actionType, recent);
  
  if (recent.length >= maxPerMinute) {
    return false; // Demasiadas acciones en el último minuto
  }
  
  recent.push(now);
  actionTimestamps.set(actionType, recent);
  return true;
}

/**
 * Formatea texto como respuesta simple (sin embeds)
 * Los embeds son una SEÑAL ENORME de selfbot
 */
export function formatPlainResponse(title: string, fields: { name: string; value: string }[]): string {
  let response = `**${title}**\n`;
  for (const field of fields) {
    response += `> **${field.name}:** ${field.value}\n`;
  }
  return response;
}

/**
 * Delay exponencial para reconexiones (backoff)
 */
export function exponentialBackoff(attempt: number, baseDelay: number = 5000): number {
  const maxDelay = 300000; // 5 minutos máximo
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.floor(Math.random() * delay * 0.3); // 30% jitter
  return delay + jitter;
}
