'use strict';
import { createLogger, format, transports, addColors, label } from 'winston';
import DatadogWinston from 'datadog-winston';

export default createLogger({
  level: 'debug',
  format: format.combine(
    format.colorize(),
    format.label({ label: 'right meow!' }),
    format.json(),
    format.timestamp()
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: process.env.LOG_FILE_PATH,
      level: 'debug',
      format: format.json(),
    }),
  ],
});
