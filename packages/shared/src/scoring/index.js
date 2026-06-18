"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCORING = void 0;
exports.scoreGuess = scoreGuess;
exports.scoreDrawer = scoreDrawer;
exports.maskWord = maskWord;
exports.normalizeGuess = normalizeGuess;
exports.levenshtein = levenshtein;
exports.classifyGuess = classifyGuess;
exports.DEFAULT_SCORING = {
    baseScore: 100,
    maxTimeBonus: 250,
    guessOrderBonus: [120, 80, 50, 30, 20, 10],
    drawerMultiplier: 40,
    drawerMaxScore: 250,
    difficultyMultiplier: { EASY: 1, MEDIUM: 1.15, HARD: 1.3 },
};
function scoreGuess(input, cfg = exports.DEFAULT_SCORING) {
    const { secondsRemaining, totalSeconds, guessOrder, difficulty } = input;
    const clampedRemaining = Math.max(0, Math.min(secondsRemaining, totalSeconds));
    const timeRatio = totalSeconds > 0 ? clampedRemaining / totalSeconds : 0;
    const timeBonus = Math.round(cfg.maxTimeBonus * timeRatio);
    const orderBonus = cfg.guessOrderBonus[guessOrder] ?? 0;
    const multiplier = cfg.difficultyMultiplier[difficulty] ?? 1;
    const core = Math.round((cfg.baseScore + timeBonus) * multiplier);
    return core + orderBonus;
}
function scoreDrawer(correctGuessers, cfg = exports.DEFAULT_SCORING) {
    return Math.min(correctGuessers * cfg.drawerMultiplier, cfg.drawerMaxScore);
}
function maskWord(word, revealCount) {
    const indices = word
        .split('')
        .map((ch, i) => ({ ch, i }))
        .filter(({ ch }) => ch !== ' ');
    const revealSet = new Set();
    const step = indices.length / Math.max(1, revealCount);
    for (let k = 0; k < revealCount && k < indices.length; k++) {
        const target = indices[Math.floor(k * step)];
        if (target)
            revealSet.add(target.i);
    }
    return word
        .split('')
        .map((ch, i) => (ch === ' ' ? '  ' : revealSet.has(i) ? ch : '_'))
        .join(' ')
        .trim();
}
function normalizeGuess(text) {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0)
        return n;
    if (n === 0)
        return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}
function classifyGuess(guess, secret) {
    const g = normalizeGuess(guess);
    const s = normalizeGuess(secret);
    if (g === s)
        return 'correct';
    if (s.length >= 4 && levenshtein(g, s) <= 1)
        return 'close';
    return 'wrong';
}
//# sourceMappingURL=index.js.map