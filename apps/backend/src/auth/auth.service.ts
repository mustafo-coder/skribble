import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { customAlphabet } from 'nanoid';
import type { AuthResponse, UserProfile } from '@skribble/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import { GuestDto, LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;
const AVATARS = Array.from({ length: 12 }, (_, i) => `avatar-${String(i + 1).padStart(2, '0')}`);
const suffix = customAlphabet('0123456789', 4);
const GUEST_ADJ = ['Brave', 'Witty', 'Sly', 'Calm', 'Jolly', 'Swift', 'Lucky', 'Cosmic'];
const GUEST_NOUN = ['Panda', 'Otter', 'Falcon', 'Cactus', 'Mango', 'Comet', 'Yeti', 'Pixel'];

interface ReqMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private toProfile(u: {
    id: string;
    username: string;
    avatar: string;
    totalGames: number;
    totalWins: number;
    rating: number;
    isGuest: boolean;
    createdAt: Date;
  }): UserProfile {
    return {
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      totalGames: u.totalGames,
      totalWins: u.totalWins,
      rating: u.rating,
      isGuest: u.isGuest,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private randomAvatar() {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)]!;
  }

  async register(dto: RegisterDto, meta: ReqMeta): Promise<AuthResponse> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      const field = existing.email === dto.email ? 'email' : 'username';
      throw new ConflictException(`That ${field} is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        avatar: this.randomAvatar(),
        isGuest: false,
      },
    });

    const tokens = await this.tokens.issuePair({
      userId: user.id,
      username: user.username,
      isGuest: false,
      ...meta,
    });
    return { user: this.toProfile(user), tokens };
  }

  async login(dto: LoginDto, meta: ReqMeta): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Constant-ish time: always run a hash comparison to avoid user enumeration.
    const ok =
      !!user?.passwordHash && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    const tokens = await this.tokens.issuePair({
      userId: user.id,
      username: user.username,
      isGuest: false,
      ...meta,
    });
    return { user: this.toProfile(user), tokens };
  }

  async guest(dto: GuestDto, meta: ReqMeta): Promise<AuthResponse> {
    const username = await this.uniqueGuestName(dto.username);
    const user = await this.prisma.user.create({
      data: { username, avatar: this.randomAvatar(), isGuest: true },
    });
    const tokens = await this.tokens.issuePair({
      userId: user.id,
      username: user.username,
      isGuest: true,
      ...meta,
    });
    return { user: this.toProfile(user), tokens };
  }

  private async uniqueGuestName(preferred?: string): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate =
        preferred && attempt === 0
          ? preferred
          : `${pick(GUEST_ADJ)}${pick(GUEST_NOUN)}${suffix()}`;
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `Guest${Date.now().toString(36)}`;
  }

  async refresh(refreshToken: string, meta: ReqMeta) {
    return this.tokens.rotate(refreshToken, meta);
  }

  async logout(refreshToken: string, allSessions = false) {
    await this.tokens.revoke(refreshToken, allSessions);
  }

  async me(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toProfile(user);
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
