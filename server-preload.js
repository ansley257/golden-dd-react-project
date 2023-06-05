'use strict';

/**
 * Set up datadog tracing. This should be called first, so Datadog can hook
 * all the other dependencies like `http`.
 */
function setUpDatadog() {
  const { tracer: Tracer } = require('dd-trace');

  const tracer = Tracer.init({
    // Your options here.
    runtimeMetrics: true,
    logInjection: true,
    appsec: true,
    analytics: true,
    env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    service: process.env.DD_SERVICE_NAME,
    version: process.env.DD_VERSION,
    runtimeMetrics: true,
    dogstatsd: { port: 8125 },
    startupLogs: true,
    serviceMapping:
      'jest:jest-golden-dd-react,next:nextjs-golden-dd-react,winston:winston-golden-dd-react',
  });
}
/**
 * Polyfill DOMParser for react-intl
 * Otherwise react-intl spews errors related to formatting
 * messages with <xml>in them</xml>
 */
function setUpDOMParser() {
  const xmldom = require('@xmldom/xmldom');
  global['DOMParser'] = xmldom.DOMParser;
}

/**
 * Set up logging. Monkey patches a bunch of stuff.
 */
function setUpLogging() {
  // pino is a simple JSON logger with Datadog integration.
  // By default it logs to STDOUT.
  const path = require('path');
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
  const winston = require('winston');

  const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.json(),
      winston.format.timestamp()
    ),
    transports: [
      // new winston.transports.Console(),
      new winston.transports.File({
        filename: process.env.DEBUG_LOG_FILE_PATH,
        level: 'debug',
        format: winston.format.json(),
      }),
    ],
  });

  // This is a helper function that returns a function that can be used
  // to log to our logger.
  function getLoggingFunction(levelName) {
    // the next line bings the logger to either logger.levelName or logger.info in order to
    // support the default console.log, console.info, etc. You can now just call to baseLogFN
    // with the arguments you want to log.
    const baseLogFn = (
      levelName === 'log' ? logger[levelName] || logger.info : logger.info
    ).bind(logger);
    // This is the function that will be used to log. It takes in a bunch of
    // arguments, and will log them to our logger.
    return function patchedLog(...parts) {
      let data = undefined;
      let error = undefined;
      let errorIndex = -1;

      const nativeError = parts.find((it, idx) => {
        const isError =
          (it && it instanceof Error) ||
          (it && typeof it === 'object' && 'level' in it && 'message' in it);
        if (isError) {
          errorIndex = idx;
        }
        return isError;
      });

      if (nativeError) {
        error = cleanObjectForSerialization(nativeError);
        // If you use Sentry, Rollbar, etc, you could capture the error here.
        // ErrorThingy.report(nativeError)
      }

      if (parts.length >= 1) {
        data = parts.reduce((acc, part, idx) => {
          if (idx !== errorIndex) {
            // handle various type of data
            switch (typeof part) {
              case 'string':
              case 'number':
              case 'boolean':
                acc[`meta`] = part;
                break;
              case 'object':
                if (JSON.stringify(part) !== JSON.stringify(error)) {
                  acc[`meta`] = cleanObjectForSerialization(part);
                }
                break;
              default:
                acc[`meta`] = String(part);
            }
          }
          return acc;
        }, {});
      }

      const messages = nativeError ? [nativeError.toString()] : parts;

      if (error) {
        baseLogFn({
          level: levelName,
          message: messages,
          error,
          ...data,
        });
      } else {
        baseLogFn({
          level: levelName,
          message: messages,
          ...data,
        });
      }
    };
  }

  // Monkey-patch Next.js logger.
  // See https://github.com/atkinchris/next-logger/blob/main/index.js
  // See https://github.com/vercel/next.js/blob/canary/packages/next/build/output/log.ts
  const nextBuiltInLogger = require('next/dist/build/output/log');
  for (const [property, value] of Object.entries(nextBuiltInLogger)) {
    if (typeof value !== 'function') {
      continue;
    }

    try {
      console[property] = getLoggingFunction(property);
    } catch (e) {
      console.error(`Failed to set console.${property}:`, e);
    }
  }

  /**
   * Monkey-patch global console.log logger. Yes. Sigh.
   */
  const loggingProperties = [
    'silly',
    'debug',
    'verbose',
    'http',
    'info',
    'warn',
    'error',
  ];
  for (const property of loggingProperties) {
    console[property] = getLoggingFunction(property);
  }

  ////////////////////////////////

  // Add general error logging.
  process.on('unhandledRejection', (error, promise) => {
    logger.error(
      {
        message: `${error.message}`,
        label: 'unhandledRejection',
        error: cleanObjectForSerialization(error),
        data: { promise: cleanObjectForSerialization(promise) },
      },
      `${error}`
    );
  });

  process.on('uncaughtException', (error) => {
    logger.error({
      message: error.message,
      label: 'uncaughtException',
      error: cleanObjectForSerialization(error),
    });
  });
}

function cleanObjectForSerialization(value) {
  // Clean up or copy `value` so our logger or error reporting system
  // can record it.
  //
  // Because our logger `pino` uses JSON.stringify, we need to do
  // the following here:
  //
  // 1. Remove all cycles. JSON.stringify throws an error when you pass
  //    a value with cyclical references.
  //    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value
  // 2. Because JSON.stringify only serializes enumerable properties, we
  //    need to copy interesting, but non-enumerable properties like
  //    value.name and value.message for errors:
  //    JSON.stringify(new Error('nothing serialized')) returns '{}'
  //
  // Implementing this correctly is beyond the scope of my example.
  function recursiveClean(input, seen) {
    if (seen.has(input)) {
      return;
    }

    if (input !== null && typeof input === 'object') {
      seen.add(input);

      if (input instanceof Error) {
        // Case 1: Error instance
        return {
          name: input.name,
          message: input.message,
          stack: input.stack,
          ...recursiveClean(Object.getPrototypeOf(input), seen),
          ...Object.keys(input).reduce(
            (acc, key) => ({ ...acc, [key]: recursiveClean(input[key], seen) }),
            {}
          ),
        };
      } else if (input.level && input.message) {
        // Case 2: Object with `level` and `message` properties
        // take the level property and remove it from the object
        const { level, ...rest } = input;
        // return the rest of the object with the level property removed
        return Object.keys(rest).reduce(
          (acc, key) => ({ ...acc, [key]: recursiveClean(rest[key], seen) }),
          {}
        );
      } else if (Array.isArray(input)) {
        // Case 3: Array
        return input.reduce(
          (acc, val, idx) => ({ ...acc, [idx]: recursiveClean(val, seen) }),
          {}
        );
      } else {
        // Case 3: Regular object
        return Object.keys(input).reduce(
          (acc, key) => ({ ...acc, [key]: recursiveClean(input[key], seen) }),
          {}
        );
      }
    } else {
      return input; // <-- directly return the value
    }
  }

  return recursiveClean(value, new WeakSet());
}

setUpDatadog();
setUpDOMParser();
setUpLogging();
