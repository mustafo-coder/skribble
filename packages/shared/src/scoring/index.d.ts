export interface ScoringConfig {
    baseScore: number;
    maxTimeBonus: number;
    guessOrderBonus: number[];
    drawerMultiplier: number;
    drawerMaxScore: number;
    difficultyMultiplier: {
        EASY: number;
        MEDIUM: number;
        HARD: number;
    };
}
export declare const DEFAULT_SCORING: ScoringConfig;
export interface GuessScoreInput {
    secondsRemaining: number;
    totalSeconds: number;
    guessOrder: number;
    difficulty: keyof ScoringConfig['difficultyMultiplier'];
}
export declare function scoreGuess(input: GuessScoreInput, cfg?: ScoringConfig): number;
export declare function scoreDrawer(correctGuessers: number, cfg?: ScoringConfig): number;
export declare function maskWord(word: string, revealCount: number): string;
export declare function normalizeGuess(text: string): string;
export declare function levenshtein(a: string, b: string): number;
export type GuessResult = 'correct' | 'close' | 'wrong';
export declare function classifyGuess(guess: string, secret: string): GuessResult;
