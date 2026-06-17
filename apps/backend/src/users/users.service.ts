import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserProfile } from '@skribble/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(id: string): Promise<UserProfile> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
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

  /** Global rating leaderboard (registered users only). */
  async topPlayers(limit = 50) {
    return this.prisma.user.findMany({
      where: { isGuest: false },
      orderBy: [{ rating: 'desc' }, { totalWins: 'desc' }],
      take: limit,
      select: { id: true, username: true, avatar: true, rating: true, totalWins: true, totalGames: true },
    });
  }

  /**
   * Apply end-of-game results to durable user stats inside a single transaction.
   * Rating uses a simple zero-sum style adjustment (winner +, others slightly -).
   */
  async applyGameResults(results: { userId: string; isWinner: boolean }[]): Promise<void> {
    const registered = results.filter((r) => r.userId);
    if (!registered.length) return;
    await this.prisma.$transaction(
      registered.map((r) =>
        this.prisma.user.update({
          where: { id: r.userId },
          data: {
            totalGames: { increment: 1 },
            totalWins: { increment: r.isWinner ? 1 : 0 },
            rating: { increment: r.isWinner ? 25 : -8 },
          },
        }),
      ),
    );
  }
}
