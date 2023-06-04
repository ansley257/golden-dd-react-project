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
      new winston.transports.Console(),
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
    const baseLogFn = (logger[levelName] || logger.info).bind(logger);
    // This is the function that will be used to log. It takes in a bunch of
    // arguments, and will log them to our logger.
    return function patchedLog(...parts) {
      let data = undefined;
      let error = undefined;

      // If next is trying to log an error, put it into the error object by calling
      // .find() and using 'it' as the callback variable.
      const nativeError = parts.find(
        (it) =>
          // it exists and is an instance of Error or it is an object with a name and message
          (it && it instanceof Error) ||
          (it && typeof it === 'object' && 'name' in it && 'message' in it)
      );

      // If nativeError is truthy, then call to cleanObjectForSerialization with the error

      if (nativeError) {
        error = cleanObjectForSerialization(nativeError);
        // If you use Sentry, Rollbar, etc, you could capture the error here.
        // ErrorThingy.report(nativeError)
      }

      // If next is trying to log funky stuff, put it into the data object.
      if (parts.length > 1) {
        // If data is undefined, set it to an empty object. Otherwise, set it to data, which should
        // already be undefined, since it's defined above as undefined, and is not reassigned.
        data = data || {};
        // Map over the parts and clean them for serialization and save that to data.parts
        const partsSerialized = parts.map((part) =>
          cleanObjectForSerialization(part)
        );

        // If part is an object, then merge it into data
        if (typeof parts === 'object') {
          data = { ...data, parts };
        }
      }

      // If nativeError is truthy and parts.length is 1, then set messages to an array with nativeError.toString()
      // Otherwise, set messages to parts. The second part of this ternary is to handle the case where
      // next is trying to log an error, but it's not an instance of Error or an object with a name and message.
      const messages =
        nativeError && parts.length === 1 ? [nativeError.toString()] : parts;

      // Call baseLogFn (logger) with data, error, and levelName, and then spread messages
      baseLogFn({ level: levelName, message: messages.join(' '), ...data });
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
   * @type {Array<keyof typeof console>}
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
        type: 'unhandledRejection',
        error: cleanObjectForSerialization(error),
        data: { promise: cleanObjectForSerialization(promise) },
      },
      `${error}`
    );
  });

  process.on('uncaughtException', (error) => {
    logger.error(
      { type: 'uncaughtException', error: cleanObjectForSerialization(error) },
      `${error}`
    );
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
  const util = require('util');

  // Remove cycles. JSON.stringify throws an error when you pass
  // a value with cyclical references.
  const cycleFreeValue = util.inspect(value, { depth: null });

  // JSON.stringify only serializes enumerable properties, we
  // need to copy interesting, but non-enumerable properties like
  // value.name and value.message for errors:
  if (value instanceof Error) {
    return {
      ...cycleFreeValue,
      name: value.name,
      message: value.message,
      stack: value.stack, // Include stack property for completeness
    };
  }

  return cycleFreeValue;
}

setUpDatadog();
setUpDOMParser();
setUpLogging();
