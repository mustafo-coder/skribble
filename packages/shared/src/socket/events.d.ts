import type { ChatMessage, DrawEndPayload, DrawMovePayload, DrawStartPayload, FillPayload, LeaderboardEntry, RoomSettings, RoomState, TurnPublicState } from '../types/game.js';
export type SocketResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: {
        code: SocketErrorCode;
        message: string;
    };
};
export type Ack<T> = (res: SocketResult<T>) => void;
export declare enum SocketErrorCode {
    UNAUTHORIZED = "UNAUTHORIZED",
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
    ROOM_FULL = "ROOM_FULL",
    ROOM_IN_PROGRESS = "ROOM_IN_PROGRESS",
    NOT_HOST = "NOT_HOST",
    NOT_DRAWER = "NOT_DRAWER",
    INVALID_PAYLOAD = "INVALID_PAYLOAD",
    RATE_LIMITED = "RATE_LIMITED",
    NOT_ENOUGH_PLAYERS = "NOT_ENOUGH_PLAYERS",
    ALREADY_GUESSED = "ALREADY_GUESSED",
    INTERNAL = "INTERNAL"
}
export interface CreateRoomPayload {
    settings: Partial<RoomSettings>;
}
export interface JoinRoomPayload {
    code: string;
}
export interface ChatPayload {
    text: string;
}
export interface GuessPayload {
    text: string;
}
export interface SelectWordPayload {
    choice: number;
}
export interface KickPayload {
    playerId: string;
}
export interface TransferHostPayload {
    playerId: string;
}
export interface UpdateSettingsPayload {
    settings: Partial<RoomSettings>;
}
export interface ClientToServerEvents {
    'room:create': (p: CreateRoomPayload, ack: Ack<{
        room: RoomState;
        playerId: string;
    }>) => void;
    'room:join': (p: JoinRoomPayload, ack: Ack<{
        room: RoomState;
        playerId: string;
    }>) => void;
    'room:leave': (ack?: Ack<void>) => void;
    'room:settings': (p: UpdateSettingsPayload, ack?: Ack<RoomState>) => void;
    'room:kick': (p: KickPayload, ack?: Ack<void>) => void;
    'host:transfer': (p: TransferHostPayload, ack?: Ack<void>) => void;
    'player:ready': (p: {
        ready: boolean;
    }) => void;
    'game:start': (ack?: Ack<void>) => void;
    'word:select': (p: SelectWordPayload) => void;
    'draw:start': (p: DrawStartPayload) => void;
    'draw:move': (p: DrawMovePayload) => void;
    'draw:end': (p: DrawEndPayload) => void;
    'draw:fill': (p: FillPayload) => void;
    'draw:clear': () => void;
    'draw:undo': () => void;
    'guess:submit': (p: GuessPayload) => void;
    'chat:message': (p: ChatPayload) => void;
    'session:resume': (ack: Ack<{
        room: RoomState;
        turn: TurnPublicState | null;
    }>) => void;
}
export interface GameStartedPayload {
    room: RoomState;
}
export interface RoundStartedPayload {
    turn: TurnPublicState;
    room: RoomState;
}
export interface WordChoicesPayload {
    choices: {
        word: string;
        difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    }[];
    endsAt: number;
}
export interface DrawingUpdatePayload {
    ops: (({
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
    })[];
}
export interface GuessCorrectPayload {
    playerId: string;
    username: string;
    points: number;
    order: number;
    word?: string;
}
export interface GuessWrongPayload {
    playerId: string;
    close: boolean;
}
export interface RoundEndedPayload {
    word: string;
    results: {
        playerId: string;
        username: string;
        delta: number;
        total: number;
    }[];
    nextAt: number;
}
export interface GameEndedPayload {
    leaderboard: LeaderboardEntry[];
    winner: LeaderboardEntry | null;
}
export interface TimerTickPayload {
    remaining: number;
    endsAt: number;
}
export interface HintRevealPayload {
    maskedWord: string;
}
export interface ServerErrorPayload {
    code: SocketErrorCode;
    message: string;
}
export interface ServerToClientEvents {
    'room:updated': (room: RoomState) => void;
    'player:joined': (p: {
        playerId: string;
        username: string;
    }) => void;
    'player:left': (p: {
        playerId: string;
        username: string;
    }) => void;
    'player:kicked': (p: {
        playerId: string;
    }) => void;
    'game:started': (p: GameStartedPayload) => void;
    'round:started': (p: RoundStartedPayload) => void;
    'word:choices': (p: WordChoicesPayload) => void;
    'word:assigned': (p: {
        word: string;
    }) => void;
    'drawing:update': (p: DrawingUpdatePayload) => void;
    'drawing:cleared': () => void;
    'guess:correct': (p: GuessCorrectPayload) => void;
    'guess:wrong': (p: GuessWrongPayload) => void;
    'chat:message': (m: ChatMessage) => void;
    'timer:tick': (p: TimerTickPayload) => void;
    'hint:reveal': (p: HintRevealPayload) => void;
    'round:ended': (p: RoundEndedPayload) => void;
    'leaderboard:update': (p: {
        entries: LeaderboardEntry[];
    }) => void;
    'game:ended': (p: GameEndedPayload) => void;
    'error': (p: ServerErrorPayload) => void;
}
export interface InterServerEvents {
    ping: () => void;
}
export interface SocketData {
    userId: string | null;
    playerId: string;
    username: string;
    avatar: string;
    roomId: string | null;
}
