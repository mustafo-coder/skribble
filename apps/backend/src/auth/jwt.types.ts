/** Shape of the decoded access-token payload. */
export interface JwtAccessPayload {
  sub: string; // userId
  username: string;
  isGuest: boolean;
  type: 'access';
}

/** Decoded refresh-token payload. `jti` ties the token to a DB row + family. */
export interface JwtRefreshPayload {
  sub: string;
  jti: string; // token id (matches RefreshToken.id)
  family: string; // rotation family
  type: 'refresh';
}

/** The authenticated principal Nest attaches to `request.user`. */
export interface AuthUser {
  userId: string;
  username: string;
  isGuest: boolean;
}
