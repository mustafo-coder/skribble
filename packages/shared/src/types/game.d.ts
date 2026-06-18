export declare enum GamePhase {
    LOBBY = "LOBBY",
    WORD_SELECTION = "WORD_SELECTION",
    DRAWING = "DRAWING",
    ROUND_END = "ROUND_END",
    GAME_END = "GAME_END"
}
export declare enum DrawTool {
    PEN = "PEN",
    ERASER = "ERASER",
    FILL = "FILL"
}
export declare enum Language {
    EN = "en",
    RU = "ru",
    ES = "es",
    DE = "de",
    FR = "fr"
}
export declare enum WordCategory {
    ANIMALS = "ANIMALS",
    FOOD = "FOOD",
    MOVIES = "MOVIES",
    OBJECTS = "OBJECTS",
    TECHNOLOGY = "TECHNOLOGY",
    COUNTRIES = "COUNTRIES",
    SPORTS = "SPORTS"
}
export declare enum WordDifficulty {
    EASY = "EASY",
    MEDIUM = "MEDIUM",
    HARD = "HARD"
}
export interface RoomSettings {
    name: string;
    maxPlayers: number;
    rounds: number;
    drawTimeSec: number;
    language: Language;
    categories: WordCategory[];
    isPrivate: boolean;
    customWordsEnabled: boolean;
    customWords: string[];
    hintsEnabled: boolean;
    wordChoiceCount: number;
}
export interface PublicPlayer {
    id: string;
    userId: string | null;
    username: string;
    avatar: string;
    score: number;
    roundScore: number;
    isHost: boolean;
    isReady: boolean;
    connected: boolean;
    hasGuessed: boolean;
    isDrawing: boolean;
    placement?: number;
}
export interface RoomState {
    id: string;
    code: string;
    hostId: string;
    phase: GamePhase;
    settings: RoomSettings;
    players: PublicPlayer[];
    currentRound: number;
    turnIndex: number;
    createdAt: number;
}
export interface TurnPublicState {
    drawerId: string;
    round: number;
    turnIndex: number;
    endsAt: number;
    maskedWord: string;
    wordLength: number;
    category: WordCategory | null;
}
export interface ChatMessage {
    id: string;
    playerId: string;
    username: string;
    text: string;
    kind: 'chat' | 'system' | 'correct' | 'close';
    timestamp: number;
}
export interface LeaderboardEntry {
    playerId: string;
    username: string;
    avatar: string;
    score: number;
    placement: number;
}
export interface StrokePoint {
    x: number;
    y: number;
}
export interface DrawStartPayload {
    strokeId: string;
    tool: DrawTool;
    color: string;
    width: number;
    point: StrokePoint;
    seq: number;
}
export interface DrawMovePayload {
    strokeId: string;
    points: StrokePoint[];
    seq: number;
}
export interface DrawEndPayload {
    strokeId: string;
    seq: number;
}
export interface FillPayload {
    point: StrokePoint;
    color: string;
    seq: number;
}
export type DrawOp = ({
    type: 'start';
} & DrawStartPayload) | ({
    type: 'move';
} & DrawMovePayload) | ({
    type: 'end';
} & DrawEndPayload) | ({
    type: 'fill';
} & FillPayload) | {
    type: 'clear';
    seq: number;
} | {
    type: 'undo';
    seq: number;
};
