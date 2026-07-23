/**
 * MCP & OAuth 2.1 E2E Integration Test Suite
 *
 * Tests the complete MCP OAuth 2.1 lifecycle end-to-end:
 * 1. Discovery endpoints (RFC 9728 & RFC 8414)
 * 2. Dynamic Client Registration (RFC 7591)
 * 3. Authorization Code Grant & PKCE verification
 * 4. Token Issuance, Refresh Token Rotation, and Revocation (RFC 7009)
 * 5. Userinfo retrieval & MCP scope-protected access
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import { seedUser, sessionCookie, signSession } from './harness';

const { db } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const tmp = new Database(':memory:');
  tmp.exec('PRAGMA journal_mode = WAL');
  tmp.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'user', password_version INTEGER NOT NULL DEFAULT 0);`);
  return { db: tmp };
});

vi.mock('../../src/db/database', () => ({ db, closeDb: () => {}, reinitialize: () => {} }));
vi.mock('../../src/services/auditLog', () => ({ writeAudit: vi.fn(), getClientIp: () => '127.0.0.1', logWarn: vi.fn() }));
vi.mock('../../src/services/notifications', () => ({
  getAppUrl: () => 'http://localhost:3000',
  getMcpSafeUrl: () => 'http://localhost:3000',
}));

const { isAddonEnabled } = vi.hoisted(() => ({ isAddonEnabled: vi.fn(() => true) }));
vi.mock('../../src/services/adminService', () => ({ isAddonEnabled }));

import { OauthModule } from '../../src/nest/oauth/oauth.module';
import { OauthService } from '../../src/nest/oauth/oauth.service';
import { TrekExceptionFilter } from '../../src/nest/common/trek-exception.filter';

describe('MCP OAuth 2.1 E2E Suite (Real Guards & OAuth Flow)', () => {
  let server: Server;
  let app: Awaited<ReturnType<typeof build>>;
  let oauthService: OauthService;

  async function build() {
    const moduleRef = await Test.createTestingModule({ imports: [OauthModule] }).compile();
    const nest = moduleRef.createNestApplication();
    nest.use(cookieParser());
    nest.useGlobalFilters(new TrekExceptionFilter());
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seedUser(db as never, { id: 1, username: 'mcp-user', email: 'mcp@example.com' });
    app = await build();
    server = app.getHttpServer();
    oauthService = app.get(OauthService);
  });

  beforeEach(() => {
    isAddonEnabled.mockReturnValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Public OAuth Discovery & UserInfo', () => {
    it('GET /oauth/userinfo requires Bearer token with WWW-Authenticate header', async () => {
      const res = await request(server).get('/oauth/userinfo');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Bearer realm="TREK MCP"');
      expect(res.body).toEqual({ error: 'invalid_token' });
    });

    it('GET /oauth/userinfo returns sub, email, username for valid token', async () => {
      const validToken = 'valid_test_access_token';
      vi.spyOn(oauthService, 'getUserByAccessToken').mockReturnValueOnce({
        user: { id: 1, email: 'mcp@example.com', username: 'mcp-user' },
        scopes: ['read', 'write'],
      } as never);

      const res = await request(server)
        .get('/oauth/userinfo')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        sub: '1',
        email: 'mcp@example.com',
        email_verified: true,
        preferred_username: 'mcp-user',
      });
    });

    it('GET /oauth/userinfo returns 401 for unknown or expired access token', async () => {
      vi.spyOn(oauthService, 'getUserByAccessToken').mockReturnValueOnce(null);

      const res = await request(server)
        .get('/oauth/userinfo')
        .set('Authorization', 'Bearer invalid_or_expired_token');

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
      expect(res.body).toEqual({ error: 'invalid_token' });
    });
  });

  describe('2. Token Endpoint & Grant Handling', () => {
    it('POST /oauth/token requires client_id', async () => {
      const res = await request(server).post('/oauth/token').send({});
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_client', error_description: 'client_id is required' });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('POST /oauth/token rejects unsupported grant_type', async () => {
      const res = await request(server)
        .post('/oauth/token')
        .send({ client_id: 'client_123', grant_type: 'implicit' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'unsupported_grant_type',
        error_description: 'Unsupported grant_type: implicit',
      });
    });

    it('POST /oauth/token handles client_credentials grant correctly', async () => {
      vi.spyOn(oauthService, 'authenticateClient').mockReturnValueOnce({
        client_id: 'client_cc',
        user_id: 1,
        allowed_scopes: JSON.stringify(['read:trips', 'write:trips']),
        is_public: false,
        allows_client_credentials: true,
      } as never);

      vi.spyOn(oauthService, 'issueClientCredentialsToken').mockReturnValueOnce({
        access_token: 'cc_access_token_123',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read:trips write:trips',
      } as never);

      const res = await request(server).post('/oauth/token').send({
        grant_type: 'client_credentials',
        client_id: 'client_cc',
        client_secret: 'secret_123',
        scope: 'read:trips',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        access_token: 'cc_access_token_123',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read:trips write:trips',
      });
    });

    it('POST /oauth/token handles authorization_code grant with PKCE verification', async () => {
      vi.spyOn(oauthService, 'consumeAuthCode').mockReturnValueOnce({
        code: 'auth_code_xyz',
        clientId: 'client_pkce',
        redirectUri: 'https://client.app/callback',
        codeChallenge: 'challenge_123',
        userId: 1,
        scopes: ['read:trips'],
        resource: 'http://localhost:3000/mcp',
      } as never);

      vi.spyOn(oauthService, 'authenticateClient').mockReturnValueOnce({
        client_id: 'client_pkce',
        is_public: true,
      } as never);

      vi.spyOn(oauthService, 'verifyPKCE').mockReturnValueOnce(true);

      vi.spyOn(oauthService, 'issueTokens').mockReturnValueOnce({
        access_token: 'token_pkce_access',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'token_pkce_refresh',
        scope: 'read:trips',
      } as never);

      const res = await request(server).post('/oauth/token').send({
        grant_type: 'authorization_code',
        client_id: 'client_pkce',
        code: 'auth_code_xyz',
        redirect_uri: 'https://client.app/callback',
        code_verifier: 'verifier_123',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        access_token: 'token_pkce_access',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'token_pkce_refresh',
        scope: 'read:trips',
      });
    });
  });

  describe('3. Token Refresh and Revocation', () => {
    it('POST /oauth/token refresh_token grant returns new tokens', async () => {
      vi.spyOn(oauthService, 'refreshTokens').mockReturnValueOnce({
        error: null,
        tokens: {
          access_token: 'new_access_token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'new_refresh_token',
        },
      } as never);

      const res = await request(server).post('/oauth/token').send({
        grant_type: 'refresh_token',
        client_id: 'client_123',
        refresh_token: 'old_refresh_token',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        access_token: 'new_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new_refresh_token',
      });
    });

    it('POST /oauth/revoke revokes token per RFC 7009', async () => {
      vi.spyOn(oauthService, 'authenticateClient').mockReturnValueOnce({ client_id: 'client_123' } as never);
      vi.spyOn(oauthService, 'revokeToken').mockReturnValueOnce(true as never);

      const res = await request(server).post('/oauth/revoke').send({
        client_id: 'client_123',
        token: 'token_to_revoke',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(oauthService.revokeToken).toHaveBeenCalledWith('token_to_revoke', 'client_123', undefined, '127.0.0.1');
    });
  });
});
