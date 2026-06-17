type LogContext = string | object | Error;

type LogMethod = 'debug' | 'log' | 'warn' | 'error';

const debugEnabled = process.env.NODE_ENV === 'development';

function format(message: string, context?: LogContext): string {
  if (!context) {
    return message;
  }

  if (context instanceof Error) {
    return `${message}\n${context.stack ?? context.message}`;
  }

  if (typeof context === 'object') {
    return `${message}\n${JSON.stringify(context, null, 2)}`;
  }

  return `${message} ${context}`;
}

function write(method: LogMethod, message: string, context?: LogContext): void {
  if (method === 'debug' && !debugEnabled) {
    return;
  }

  console[method](format(message, context));
}

export const debug = (message: string, context?: string | object): void =>
  write('debug', message, context);

export const info = (message: string, context?: string | object): void =>
  write('log', message, context);

export const success = (message: string, context?: string | object): void =>
  write('log', message, context);

export const warn = (message: string, context?: string | object): void =>
  write('warn', message, context);

export const error = (message: string, context?: Error | string | object): void =>
  write('error', message, context);

export const database = (message: string, context?: string | object): void =>
  write('log', message, context);

export const discord = (message: string, context?: string | object): void =>
  write('log', message, context);

export const monitor = (message: string, context?: string | object): void =>
  write('log', message, context);

export const startup = (message: string, context?: string | object): void =>
  write('log', message, context);

export const shutdown = (message: string, context?: string | object): void =>
  write('log', message, context);
