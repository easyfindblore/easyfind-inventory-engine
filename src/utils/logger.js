'use strict';

/**
 * Logger — EasyFind Inventory Engine
 * Structured logging using Winston.
 * Never logs API keys, access tokens, or personal data.
 */

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}] ${message}`;
  if (stack) log += `\n${stack}`;
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return log + metaStr;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL === 'silent' ? 'silent'
       : process.env.NODE_ENV === 'production' ? 'info'
       : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: combine(
        colorize({ all: process.env.NODE_ENV !== 'production' }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),
  ],
});

module.exports = logger;
