"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordDifficulty = exports.WordCategory = exports.Language = exports.DrawTool = exports.GamePhase = void 0;
var GamePhase;
(function (GamePhase) {
    GamePhase["LOBBY"] = "LOBBY";
    GamePhase["WORD_SELECTION"] = "WORD_SELECTION";
    GamePhase["DRAWING"] = "DRAWING";
    GamePhase["ROUND_END"] = "ROUND_END";
    GamePhase["GAME_END"] = "GAME_END";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
var DrawTool;
(function (DrawTool) {
    DrawTool["PEN"] = "PEN";
    DrawTool["ERASER"] = "ERASER";
    DrawTool["FILL"] = "FILL";
})(DrawTool || (exports.DrawTool = DrawTool = {}));
var Language;
(function (Language) {
    Language["EN"] = "en";
    Language["RU"] = "ru";
    Language["ES"] = "es";
    Language["DE"] = "de";
    Language["FR"] = "fr";
})(Language || (exports.Language = Language = {}));
var WordCategory;
(function (WordCategory) {
    WordCategory["ANIMALS"] = "ANIMALS";
    WordCategory["FOOD"] = "FOOD";
    WordCategory["MOVIES"] = "MOVIES";
    WordCategory["OBJECTS"] = "OBJECTS";
    WordCategory["TECHNOLOGY"] = "TECHNOLOGY";
    WordCategory["COUNTRIES"] = "COUNTRIES";
    WordCategory["SPORTS"] = "SPORTS";
})(WordCategory || (exports.WordCategory = WordCategory = {}));
var WordDifficulty;
(function (WordDifficulty) {
    WordDifficulty["EASY"] = "EASY";
    WordDifficulty["MEDIUM"] = "MEDIUM";
    WordDifficulty["HARD"] = "HARD";
})(WordDifficulty || (exports.WordDifficulty = WordDifficulty = {}));
//# sourceMappingURL=game.js.map