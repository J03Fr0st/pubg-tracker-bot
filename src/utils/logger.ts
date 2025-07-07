export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
}

interface LogConfig {
  level: LogLevel;
  enableTimestamp: boolean;
  enableColors: boolean;
}

/**
 * Enhanced logger with icons, colors, and timestamps
 */
export class Logger {
  private static instance: Logger;
  private settings: LogConfig;

  // ANSI color codes
  private readonly colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
  };

  // Icons for different log levels
  private readonly icons = {
    debug: '🔍',
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    api: '🌐',
    database: '💾',
    discord: '🤖',
    monitor: '👀',
    config: '⚙️',
    startup: '🚀',
    shutdown: '🛑',
  };

  private constructor(initialConfig: Partial<LogConfig> = {}) {
    this.settings = {
      level: LogLevel.INFO,
      enableTimestamp: true,
      enableColors: true,
      ...initialConfig,
    };
  }

  public static getInstance(initialConfig?: Partial<LogConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(initialConfig);
    }
    return Logger.instance;
  }

  /**
   * Sets the minimum log level
   * @param level The minimum log level to display
   */
  public setLevel(level: LogLevel): void {
    this.settings.level = level;
  }

  /**
   * Enables or disables colors
   * @param enabled Whether to enable colors
   */
  public setColors(enabled: boolean): void {
    this.settings.enableColors = enabled;
  }

  /**
   * Enables or disables timestamps
   * @param enabled Whether to enable timestamps
   */
  public setTimestamp(enabled: boolean): void {
    this.settings.enableTimestamp = enabled;
  }

  /**
   * Debug level logging
   * @param message The message to log
   * @param context Optional context or data
   */
  public debug(message: string, context?: string | object): void {
    this.log(LogLevel.DEBUG, message, this.icons.debug, this.colors.gray, context);
  }

  /**
   * Info level logging
   * @param message The message to log
   * @param context Optional context or data
   */
  public info(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.info, this.colors.blue, context);
  }

  /**
   * Success level logging
   * @param message The message to log
   * @param context Optional context or data
   */
  public success(message: string, context?: string | object): void {
    this.log(LogLevel.SUCCESS, message, this.icons.success, this.colors.green, context);
  }

  /**
   * Warning level logging
   * @param message The message to log
   * @param context Optional context or data
   */
  public warn(message: string, context?: string | object): void {
    this.log(LogLevel.WARN, message, this.icons.warn, this.colors.yellow, context);
  }

  /**
   * Error level logging
   * @param message The message to log
   * @param error Optional error object or context
   */
  public error(message: string, error?: Error | string | object): void {
    this.log(LogLevel.ERROR, message, this.icons.error, this.colors.red, error);
  }

  // Specialized logging methods for different contexts
  public api(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.api, this.colors.cyan, context);
  }

  public database(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.database, this.colors.magenta, context);
  }

  public discord(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.discord, this.colors.blue, context);
  }

  public monitor(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.monitor, this.colors.green, context);
  }

  public config(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.config, this.colors.yellow, context);
  }

  public startup(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.startup, this.colors.green, context);
  }

  public shutdown(message: string, context?: string | object): void {
    this.log(LogLevel.INFO, message, this.icons.shutdown, this.colors.red, context);
  }

  /**
   * Core logging method
   * @param level The log level
   * @param message The message to log
   * @param icon The icon to display
   * @param color The color to use
   * @param context Optional context or data
   */
  private log(
    level: LogLevel,
    message: string,
    icon: string,
    color: string,
    context?: string | object | Error
  ): void {
    if (level < this.settings.level) {
      return;
    }

    const timestamp = this.settings.enableTimestamp ? this.formatTimestamp() : '';
    const coloredMessage = this.settings.enableColors
      ? `${color}${message}${this.colors.reset}`
      : message;

    let logMessage = `${icon} ${timestamp}${coloredMessage}`;

    // Handle context/error data
    if (context) {
      if (context instanceof Error) {
        logMessage += `\n${this.formatError(context)}`;
      } else if (typeof context === 'object') {
        logMessage += `\n${this.formatObject(context)}`;
      } else {
        logMessage += ` ${context}`;
      }
    }

    // Use appropriate console method based on log level
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
        break;
    }
  }

  /**
   * Formats timestamp for log messages
   * @returns Formatted timestamp string
   */
  private formatTimestamp(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const color = this.settings.enableColors ? this.colors.gray : '';
    const reset = this.settings.enableColors ? this.colors.reset : '';
    return `${color}[${timestamp}]${reset} `;
  }

  /**
   * Formats error objects for display
   * @param error The error to format
   * @returns Formatted error string
   */
  private formatError(error: Error): string {
    const color = this.settings.enableColors ? this.colors.red : '';
    const reset = this.settings.enableColors ? this.colors.reset : '';
    return `${color}Error: ${error.message}${error.stack ? '\n' + error.stack : ''}${reset}`;
  }

  /**
   * Formats objects for display
   * @param obj The object to format
   * @returns Formatted object string
   */
  private formatObject(obj: object): string {
    const color = this.settings.enableColors ? this.colors.dim : '';
    const reset = this.settings.enableColors ? this.colors.reset : '';
    return `${color}${JSON.stringify(obj, null, 2)}${reset}`;
  }
}

// Create and export a default logger instance
export const logger = Logger.getInstance({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true,
});

// Export convenience methods for direct usage
export const debug = (message: string, context?: string | object) => logger.debug(message, context);
export const info = (message: string, context?: string | object) => logger.info(message, context);
export const success = (message: string, context?: string | object) =>
  logger.success(message, context);
export const warn = (message: string, context?: string | object) => logger.warn(message, context);
export const error = (message: string, error?: Error | string | object) =>
  logger.error(message, error);

// Export specialized logging methods
export const api = (message: string, context?: string | object) => logger.api(message, context);
export const database = (message: string, context?: string | object) =>
  logger.database(message, context);
export const discord = (message: string, context?: string | object) =>
  logger.discord(message, context);
export const monitor = (message: string, context?: string | object) =>
  logger.monitor(message, context);
export const logConfig = (message: string, context?: string | object) =>
  logger.config(message, context);
export const startup = (message: string, context?: string | object) =>
  logger.startup(message, context);
export const shutdown = (message: string, context?: string | object) =>
  logger.shutdown(message, context);
