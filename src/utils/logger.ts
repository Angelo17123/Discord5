import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import chalk from 'chalk';
import path from 'path';

// Colores personalizados para consola
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    const levelColors: { [key: string]: (text: string) => string } = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.cyan,
      debug: chalk.gray,
      cmd: chalk.magenta,
      event: chalk.green,
      voice: chalk.blue,
      ready: chalk.green.bold,
    };

    const color = levelColors[level] || chalk.white;
    const levelUpper = level.toUpperCase().padEnd(5);
    
    return `${chalk.gray(`[${timestamp}]`)} ${color(`[${levelUpper}]`)} ${message}`;
  })
);

// Formato para archivos
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Transporte rotativo para logs generales
const generalRotate = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'general-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: fileFormat,
  level: 'info',
});

// Transporte rotativo para errores
const errorRotate = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat,
  level: 'error',
});

// Transporte rotativo para debug
const debugRotate = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'debug-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '50m',
  maxFiles: '7d',
  format: fileFormat,
  level: 'debug',
});

// Crear logger
const logger = winston.createLogger({
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    cmd: 3,
    event: 4,
    voice: 5,
    ready: 6,
    debug: 7,
    silly: 8,
  },
  transports: [
    // Consola
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || 'info',
    }),
    // Archivos
    generalRotate,
    errorRotate,
    debugRotate,
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'rejections.log'),
      format: fileFormat,
    }),
  ],
  exitOnError: false,
});

// Métodos helper
export const log = {
  error: (message: string, meta?: any) => logger.error(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  cmd: (message: string, meta?: any) => logger.log('cmd', message, meta),
  event: (message: string, meta?: any) => logger.log('event', message, meta),
  voice: (message: string, meta?: any) => logger.log('voice', message, meta),
  ready: (message: string, meta?: any) => logger.log('ready', message, meta),
  silly: (message: string, meta?: any) => logger.silly(message, meta),
};

// Logger de comandos
export function logCommand(user: string, command: string, args: string[], guild?: string) {
  log.cmd(`[${chalk.yellow(user)}] Ejecutó: ${chalk.cyan(command)} ${args.join(' ')} ${guild ? chalk.gray(`[${guild}]`) : ''}`);
}

// Logger de eventos
export function logEvent(eventName: string, details: string) {
  log.event(`[${chalk.yellow(eventName)}] ${details}`);
}

// Logger de voz
export function logVoice(action: string, channel: string, guild?: string) {
  log.voice(`[${chalk.blue(action)}] ${channel} ${guild ? chalk.gray(`[${guild}]`) : ''}`);
}

// Logger de errores detallado
export function logError(error: Error, context?: string) {
  log.error(`${context ? `[${context}] ` : ''}${error.message}`);
  log.debug(error.stack || 'No stack trace available');
}

export default logger;
