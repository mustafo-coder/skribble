"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketErrorCode = void 0;
var SocketErrorCode;
(function (SocketErrorCode) {
    SocketErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    SocketErrorCode["ROOM_NOT_FOUND"] = "ROOM_NOT_FOUND";
    SocketErrorCode["ROOM_FULL"] = "ROOM_FULL";
    SocketErrorCode["ROOM_IN_PROGRESS"] = "ROOM_IN_PROGRESS";
    SocketErrorCode["NOT_HOST"] = "NOT_HOST";
    SocketErrorCode["NOT_DRAWER"] = "NOT_DRAWER";
    SocketErrorCode["INVALID_PAYLOAD"] = "INVALID_PAYLOAD";
    SocketErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    SocketErrorCode["NOT_ENOUGH_PLAYERS"] = "NOT_ENOUGH_PLAYERS";
    SocketErrorCode["ALREADY_GUESSED"] = "ALREADY_GUESSED";
    SocketErrorCode["INTERNAL"] = "INTERNAL";
})(SocketErrorCode || (exports.SocketErrorCode = SocketErrorCode = {}));
//# sourceMappingURL=events.js.map