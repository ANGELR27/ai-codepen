export interface GeneratedCode {
  html: string;
  css: string;
  javascript: string;
}

export type LogType = 'log' | 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
    type: LogType;
    timestamp: string;
    message: any[];
}
