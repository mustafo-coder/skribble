"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PALETTE = exports.DEFAULT_ROOM_SETTINGS = exports.LIMITS = exports.ROOM_CODE_LENGTH = void 0;
const game_js_1 = require("./types/game.js");
exports.ROOM_CODE_LENGTH = 6;
exports.LIMITS = {
    minPlayers: 2,
    maxPlayers: 20,
    minRounds: 1,
    maxRounds: 10,
    minDrawTime: 30,
    maxDrawTime: 180,
    wordChoiceTimeoutSec: 15,
    roundEndDelaySec: 6,
    gameEndDelaySec: 12,
    maxChatLength: 120,
    maxUsernameLength: 20,
    maxCustomWords: 500,
};
exports.DEFAULT_ROOM_SETTINGS = {
    name: 'New Room',
    maxPlayers: 8,
    rounds: 3,
    drawTimeSec: 80,
    language: game_js_1.Language.EN,
    categories: [
        game_js_1.WordCategory.ANIMALS,
        game_js_1.WordCategory.FOOD,
        game_js_1.WordCategory.OBJECTS,
        game_js_1.WordCategory.TECHNOLOGY,
    ],
    isPrivate: false,
    customWordsEnabled: false,
    customWords: [],
    hintsEnabled: true,
    wordChoiceCount: 3,
};
exports.DEFAULT_PALETTE = [
    '#000000', '#7f7f7f', '#c1c1c1', '#ffffff', '#ef130b', '#ff7100',
    '#ffe400', '#00cc00', '#00b2ff', '#231fd3', '#a300ba', '#d37caa',
    '#a0522d', '#ffac6e', '#f6b9a0', '#94e3a7', '#a7eef5', '#9697f1',
];
//# sourceMappingURL=constants.js.map