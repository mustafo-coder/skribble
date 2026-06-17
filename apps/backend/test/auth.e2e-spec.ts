import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Boots the full Nest app against the CI Postgres + Redis services and exercises
 * the auth lifecycle end-to-end: register → me → refresh (rotation) → guest.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `e2e_${Date.now()}@test.dev`;
  const username = `e2e_${Date.now().toString(36)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers a new user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username, password: 'supersecret1' })
      .expect(201);
    expect(res.body.user.username).toBe(username);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
  });

  it('rejects a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username: `${username}2`, password: 'supersecret1' })
      .expect(409);
  });

  it('authenticates /auth/me with the access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'supersecret1' })
      .expect(200);
    const token = login.body.tokens.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.username).toBe(username);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'supersecret1' })
      .expect(200);
    const oldRefresh = login.body.tokens.refreshToken;

    // First rotation succeeds.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(200);

    // Replaying the now-revoked token is forbidden (reuse detection).
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(403);
  });

  it('creates a guest session without registration', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/guest').send({}).expect(201);
    expect(res.body.user.isGuest).toBe(true);
    expect(res.body.tokens.accessToken).toBeDefined();
  });
});
