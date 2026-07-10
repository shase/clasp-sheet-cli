export interface ToolConfig {
  claspProjectPath: string;
  scriptId: string;
  spreadsheetId: string;
  defaultSheet?: string;
}

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
  suggestion?: string;
}

export interface ExecutionAdapter {
  invoke<T = unknown>(functionName: string, params: unknown[]): Promise<T>;
  doctor(): Promise<DoctorCheck[]>;
}

export class CliError extends Error {
  suggestion?: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = 'CliError';
    this.suggestion = suggestion;
  }
}
