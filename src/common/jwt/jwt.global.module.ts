// src/common/jwt/jwt.global.module.ts
import { Global, Module } from "@nestjs/common";
import { JwtModule as NestJwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Global()
@Module({
  imports: [
    NestJwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>("JWT_ACCESS_SECRET"), // ❌ بدون fallback
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [NestJwtModule, JwtAuthGuard],
})
export class JwtGlobalModule {}
