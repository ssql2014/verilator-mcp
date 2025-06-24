import winston from 'winston';
import { join } from 'path';
import { homedir } from 'os';

const logDir = join(homedir(), '.verilator-mcp', 'logs');

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'verilator-mcp' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: join(logDir, 'error.log'),
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: join(logDir, 'combined.log'),
    })
  );
}