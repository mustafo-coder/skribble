import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { loadConfig } from './config/configuration';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule, {
    logger: cfg.isProd ? ['log', 'warn', 'error'] : ['debug', 'log', 'warn', 'error'],
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: cfg.clientOrigin, credentials: true });

  // Strip unknown props, reject extras, coerce types on every DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Drain DB pool on SIGTERM/SIGINT for zero-downtime rolling deploys.
  app.enableShutdownHooks();
  app.get(PrismaService).enableShutdownHooks(app);

  await app.listen(cfg.port, '0.0.0.0');
  Logger.log(`🎨 Skribble API + Socket.IO listening on :${cfg.port}`, 'Bootstrap');
}

void bootstrap();
