import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CliError } from './types.js';

/**
 * Obtains an OAuth access token by reusing the existing `clasp login`
 * credentials (~/.clasprc.json). No separate GCP project / OAuth client is
 * needed: the token belongs to the same account that owns and deployed the
 * Apps Script, so it satisfies a DOMAIN-restricted Web App.
 *
 * The stored access token is short-lived, so it is transparently refreshed
 * with the stored refresh token when (nearly) expired.
 */

interface ClaspRc {
  token?: {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };
  oauth2ClientSettings?: {
    clientId?: string;
    clientSecret?: string;
  };
}

const CLASPRC_PATH = path.join(os.homedir(), '.clasprc.json');
const EXPIRY_SKEW_MS = 60_000;

export async function getClaspAccessToken(): Promise<string> {
  let rc: ClaspRc;
  try {
    rc = JSON.parse(await readFile(CLASPRC_PATH, 'utf8')) as ClaspRc;
  } catch {
    throw new CliError('Could not read clasp credentials (~/.clasprc.json).', 'Run: clasp login');
  }

  const token = rc.token;
  if (!token?.access_token) {
    throw new CliError('clasp credentials have no access token.', 'Run: clasp login');
  }

  if (token.expiry_date && token.expiry_date - EXPIRY_SKEW_MS > Date.now()) {
    return token.access_token;
  }

  return refreshAccessToken(rc);
}

async function refreshAccessToken(rc: ClaspRc): Promise<string> {
  const refreshToken = rc.token?.refresh_token;
  const clientId = rc.oauth2ClientSettings?.clientId;
  const clientSecret = rc.oauth2ClientSettings?.clientSecret;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new CliError('clasp access token expired and cannot be refreshed.', 'Run: clasp login');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `Token refresh request failed: ${message}`,
      'Behind a corporate proxy set NODE_EXTRA_CA_CERTS to a CA bundle.'
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new CliError(`Token refresh failed (HTTP ${response.status}).`, 'Run: clasp login');
  }

  let json: { access_token?: string };
  try {
    json = JSON.parse(text) as { access_token?: string };
  } catch {
    throw new CliError('Token refresh response was not JSON.', 'Run: clasp login');
  }

  if (!json.access_token) {
    throw new CliError('Token refresh response had no access_token.', 'Run: clasp login');
  }

  return json.access_token;
}
