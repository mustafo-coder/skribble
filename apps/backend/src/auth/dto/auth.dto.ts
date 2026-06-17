import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(USERNAME_RE, { message: 'username may contain letters, numbers and underscores only' })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class GuestDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(USERNAME_RE)
  username?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
