import { Injectable } from '@nestjs/common';
import { Language, Prisma, WordCategory, WordDifficulty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface WordCandidate {
  word: string;
  difficulty: WordDifficulty;
  category: WordCategory | null;
}

interface PickOptions {
  language: Language;
  categories: WordCategory[];
  count: number;
  customWords?: string[];
  /** words already used this game, to avoid repeats */
  exclude?: string[];
}

@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pick `count` distinct word candidates for a drawer to choose from.
   * If custom words are enabled they're blended in (capped) before falling back
   * to the dictionary. Uses ORDER BY random() — fine for the modest dictionary
   * size; for very large dictionaries swap to a keyset/offset sampling strategy.
   */
  async pickCandidates(opts: PickOptions): Promise<WordCandidate[]> {
    const { language, categories, count, customWords = [], exclude = [] } = opts;
    const excludeSet = new Set(exclude.map((w) => w.toLowerCase()));
    const out: WordCandidate[] = [];

    // 1) Blend in custom words first (room owner intent wins).
    const customs = customWords
      .filter((w) => w.trim() && !excludeSet.has(w.toLowerCase()))
      .sort(() => Math.random() - 0.5);
    for (const w of customs) {
      if (out.length >= Math.ceil(count / 2)) break;
      out.push({ word: w.trim(), difficulty: WordDifficulty.MEDIUM, category: null });
      excludeSet.add(w.toLowerCase());
    }

    // 2) Fill the rest from the dictionary.
    const remaining = count - out.length;
    if (remaining > 0) {
      const rows = await this.prisma.$queryRaw<
        { text: string; difficulty: WordDifficulty; category: WordCategory }[]
      >(Prisma.sql`
        SELECT "text", "difficulty", "category"
        FROM "words"
        WHERE "language" = ${language}::"Language"
          AND "category" = ANY(${categories}::"WordCategory"[])
          AND lower("text") <> ALL(${Array.from(excludeSet)}::text[])
        ORDER BY random()
        LIMIT ${remaining * 3}
      `);
      for (const r of rows) {
        if (out.length >= count) break;
        if (excludeSet.has(r.text.toLowerCase())) continue;
        out.push({ word: r.text, difficulty: r.difficulty, category: r.category });
        excludeSet.add(r.text.toLowerCase());
      }
    }

    // 3) Last-resort fallback so a turn can always start.
    while (out.length < count) {
      out.push({ word: FALLBACK[out.length % FALLBACK.length]!, difficulty: WordDifficulty.EASY, category: null });
    }
    return out.slice(0, count);
  }

  listCategories(): WordCategory[] {
    return Object.values(WordCategory);
  }

  listLanguages(): Language[] {
    return Object.values(Language);
  }
}

const FALLBACK = ['apple', 'house', 'tree', 'car', 'sun', 'book', 'star', 'fish'];
