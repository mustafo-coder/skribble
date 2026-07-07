import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/configuration';
import { JwtAccessPayload, JwtRefreshPayload } from './jwt.types';

interface IssueContext {
  userId: string;
  username: string;
  isGuest: boolean;
  userAgent?: string;
  ip?: string;
  /** Reuse the family on rotation; omit to start a new family on login. */
  family?: string;
}

/**
 * Issues access tokens and manages **rotating** refresh tokens with reuse
 * detection:
 *   - Each refresh token belongs to a `family`.
 *   - On refresh we revoke the presented token and issue a new one in the same
 *     family.
 *   - If a *revoked* token is presented again (token theft / replay), we revoke
 *     the entire family, forcing re-login. This is the OWASP-recommended pattern.
 *
 * Only SHA-256 hashes of tokens are stored, so a DB leak doesn't expose usable
 * refresh tokens.
 */
@Injectable()
export class TokenService {
  private readonly cfg: AppConfig['jwt'];

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService<{ config: AppConfig }>,
  ) {
    this.cfg = config.get('config', { infer: true })!.jwt;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signAccess(ctx: IssueContext): string {
    const payload: JwtAccessPayload = {
      sub: ctx.userId,
      username: ctx.username,
      isGuest: ctx.isGuest,
      type: 'access',
    };
    return this.jwt.sign(payload, {
      secret: this.cfg.accessSecret,
      expiresIn: this.cfg.accessTtl,
    });
  }

  /** Persists a refresh-token row and returns the signed JWT. */
  private async signRefresh(ctx: IssueContext): Promise<string> {
    const jti = randomUUID();
    const family = ctx.family ?? randomUUID();
    const payload: JwtRefreshPayload = { sub: ctx.userId, jti, family, type: 'refresh' };
    // `jti` is already in the payload; passing `jwtid` too makes jsonwebtoken throw.
    const token = this.jwt.sign(payload, {
      secret: this.cfg.refreshSecret,
      expiresIn: this.cfg.refreshTtl,
    });

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: ctx.userId,
        tokenHash: this.hash(token),
        family,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: new Date(Date.now() + this.cfg.refreshTtl * 1000),
      },
    });
    return token;
  }

  /** Issue a fresh access + refresh pair (login / register / guest). */
  async issuePair(ctx: IssueContext) {
    const [accessToken, refreshToken] = await Promise.all([
      Promise.resolve(this.signAccess(ctx)),
      this.signRefresh(ctx),
    ]);
    return { accessToken, refreshToken, expiresIn: this.cfg.accessTtl };
  }

  /** Verify + rotate. Detects replay of a revoked token and kills the family. */
  async rotate(presented: string, meta: { userAgent?: string; ip?: string }) {
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwt.verify<JwtRefreshPayload>(presented, {
        secret: this.cfg.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Wrong token type');

    const row = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!row || row.tokenHash !== this.hash(presented)) {
      throw new UnauthorizedException('Unknown refresh token');
    }

    // Replay of an already-rotated/revoked token => compromise. Burn the family.
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { family: row.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException('Refresh token reuse detected — session revoked');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('User no longer exists');

    // Revoke the presented token, then mint a replacement in the same family.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return this.issuePair({
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
      family: row.family,
      ...meta,
    });
  }

  /** Logout: revoke a single token (or its whole family). */
  async revoke(presented: string, allSessions = false) {
    try {
      const payload = this.jwt.verify<JwtRefreshPayload>(presented, {
        secret: this.cfg.refreshSecret,
      });
      await this.prisma.refreshToken.updateMany({
        where: allSessions ? { family: payload.family } : { id: payload.jti },
        data: { revokedAt: new Date() },
      });
    } catch {
      /* already invalid — nothing to revoke */
    }
  }

  /** Verify an access token (used by the WS handshake guard). */
  verifyAccess(token: string): JwtAccessPayload {
    const payload = this.jwt.verify<JwtAccessPayload>(token, { secret: this.cfg.accessSecret });
    if (payload.type !== 'access') throw new UnauthorizedException();
    return payload;
  }
}
