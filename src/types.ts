export interface ToolConfig {
  claspProjectPath: string;
  scriptId: string;
  spreadsheetId: string;
  defaultSheet?: string;
  /** Web App /exec URL the CLI calls over HTTP (GCP-less execution). */
  webAppUrl?: string;
  /** Optional shared secret sent with each Web App call (matched against Script Property SHEET_TOOL_TOKEN). */
  token?: string;
  /**
   * Authorization for Web App calls.
   * - 'clasp': attach a Bearer token from the existing `clasp login` (~/.clasprc.json).
   *   Required for DOMAIN / MYSELF access deployments.
   * - 'none' (default): no Authorization header (only works with ANYONE_ANONYMOUS access).
   */
  auth?: 'clasp' | 'none';
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
