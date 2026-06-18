import { RoomSettings } from './types/game.js';
export declare const ROOM_CODE_LENGTH = 6;
export declare const LIMITS: {
    readonly minPlayers: 2;
    readonly maxPlayers: 20;
    readonly minRounds: 1;
    readonly maxRounds: 10;
    readonly minDrawTime: 30;
    readonly maxDrawTime: 180;
    readonly wordChoiceTimeoutSec: 15;
    readonly roundEndDelaySec: 6;
    readonly gameEndDelaySec: 12;
    readonly maxChatLength: 120;
    readonly maxUsernameLength: 20;
    readonly maxCustomWords: 500;
};
export declare const DEFAULT_ROOM_SETTINGS: RoomSettings;
export declare const DEFAULT_PALETTE: readonly ["#000000", "#7f7f7f", "#c1c1c1", "#ffffff", "#ef130b", "#ff7100", "#ffe400", "#00cc00", "#00b2ff", "#231fd3", "#a300ba", "#d37caa", "#a0522d", "#ffac6e", "#f6b9a0", "#94e3a7", "#a7eef5", "#9697f1"];
