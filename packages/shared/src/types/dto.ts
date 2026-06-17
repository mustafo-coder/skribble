/** REST DTO contracts shared between backend controllers and frontend api client. */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  totalGames: number;
  totalWins: number;
  rating: number;
  isGuest: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface GuestRequest {
  username?: string; // optional; server generates one if absent
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  inProgress: boolean;
  language: string;
}
