import { getClaspAccessToken } from './auth.js';
import { CliError, type DoctorCheck, type ExecutionAdapter, type ToolConfig } from './types.js';

type RpcResponse<T> = { ok: true; result: T } | { ok: false; error: string };

/**
 * GCP-less execution adapter. Instead of `clasp run` (which requires a linked
 * standard GCP project + `clasp login --creds`), this calls a deployed Apps
 * Script Web App over HTTP using the same { fn, params } RPC contract.
 */
export class WebAppExecutionAdapter implements ExecutionAdapter {
  private readonly config: ToolConfig;

  constructor(config: ToolConfig) {
    this.config = config;
  }

  async invoke<T = unknown>(functionName: string, params: unknown[]): Promise<T> {
    const url = this.config.webAppUrl;
    if (!url) {
      throw new CliError('webAppUrl is not configured.', 'Run: sheet init ... --web-app-url <exec-url>');
    }

    const body = JSON.stringify({ fn: functionName, params, token: this.config.token });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.auth === 'clasp') {
      headers.Authorization = `Bearer ${await getClaspAccessToken()}`;
    }

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'follow'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError(
        `Web app request failed: ${message}`,
        'Check webAppUrl. Behind a corporate proxy set NODE_EXTRA_CA_CERTS to a CA bundle.'
      );
    }

    const text = await response.text();

    if (!response.ok) {
      throw new CliError(
        `Web app returned HTTP ${response.status}.`,
        truncate(text) || 'Verify the deployment is active and accessible.'
      );
    }

    let parsed: RpcResponse<T>;
    try {
      parsed = JSON.parse(text) as RpcResponse<T>;
    } catch {
      throw new CliError(
        'Web app response was not JSON.',
        'The URL may be an HTML auth/consent page. Re-check the deployment access (ANYONE_ANONYMOUS) and authorization.'
      );
    }

    if (!parsed || parsed.ok !== true) {
      const err = parsed && 'error' in parsed ? parsed.error : 'unknown error';
      if (err === 'unauthorized') {
        throw new CliError('Web app rejected the request: unauthorized.', 'Set a matching token in config (see SHEET_TOOL_TOKEN).');
      }
      throw new CliError(`Apps Script error: ${err}`, 'Run sheet doctor for diagnostics.');
    }

    return parsed.result;
  }

  async doctor(): Promise<DoctorCheck[]> {
    const checks: DoctorCheck[] = [];

    if (!this.config.webAppUrl) {
      checks.push({
        id: 'webapp-config',
        status: 'fail',
        message: 'webAppUrl is not set in config.',
        suggestion: 'Deploy the Apps Script as a Web App and run: sheet init ... --web-app-url <exec-url>'
      });
      return checks;
    }

    checks.push({
      id: 'webapp-config',
      status: 'pass',
      message: `webAppUrl configured (${this.config.webAppUrl}).`
    });

    try {
      const ping = await this.invoke<{ ok?: boolean; timestamp?: string }>('ping', []);
      checks.push({
        id: 'webapp-ping',
        status: 'pass',
        message: `web app ping succeeded${ping && ping.timestamp ? ` (${ping.timestamp})` : ''}.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        id: 'webapp-ping',
        status: 'fail',
        message: `web app ping failed: ${message}`,
        suggestion:
          'Confirm the Web App deployment is active with access ANYONE_ANONYMOUS, the deploying user authorized the scopes, and the token (if any) matches.'
      });
    }

    return checks;
  }
}

function truncate(value: string, max = 500): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
