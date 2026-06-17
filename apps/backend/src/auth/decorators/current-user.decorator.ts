import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../jwt.types';

/** Injects the authenticated principal: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
