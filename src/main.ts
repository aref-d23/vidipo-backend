// backend/src/main.ts
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

// ✅ ۱. ایمپورت Express برای دسترسی به json و urlencoded
import express from "express";

// ✅ ۲. تعریف متغیرها برای استفاده راحت‌تر در بدنه تابع bootstrap
const json = express.json;
const urlencoded = express.urlencoded;

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  try {
    console.log("🔧 [Bootstrap] Starting...");
    // ساخت اپلیکیشن
    const app = await NestFactory.create(AppModule, {
      cors: false, // خودمان مدیریت می‌کنیم
      bufferLogs: false, // لاگ‌ها را مستقیم چاپ می‌کند
    });
    console.log("✅ [Bootstrap] NestFactory created");

    const cfg = app.get(ConfigService);

    // امنیت هدرها
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: false, // برای توسعه خاموش است
      }),
    );

    // ✅ ۳. حالا json و urlencoded شناخته شده هستند
    app.use(json({ limit: "50mb" }));
    app.use(urlencoded({ extended: true, limit: "50mb" }));

    // اعتبارسنجی DTOها
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    // فیلتر خطای جهانی
    app.useGlobalFilters(new AllExceptionsFilter());

    // پیشوند API
    app.setGlobalPrefix("api");

    // CORS: allow native clients without Origin and explicitly trusted web origins
    const allowedOrigins = (cfg.get<string>("CORS_ORIGINS") || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      credentials: true,
    });

    // دریافت پورت از env
    const port = cfg.get<number>("PORT") || 3000;
    console.log(`🔧 [Bootstrap] Starting server on port ${port}...`);

    // گوش دادن روی تمام IP ها (0.0.0.0) تا از LAN قابل دسترس باشد
    await app.listen(port, "0.0.0.0");
    console.log(`✅ [Bootstrap] Server listening on port ${port}`);

    logger.log(`🚀 API running on http://localhost:${port}/api`, "Bootstrap");
    logger.log(`📡 Accessible via Local Network IPs`, "Bootstrap");
  } catch (error) {
    logger.error("❌ Critical Bootstrap Failure:", error);
    process.exit(1);
  }
}

bootstrap();
