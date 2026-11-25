import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { FieldCryptoService } from "../common/crypto/field-crypto.service";
import { SmsService } from "../sms/sms.service";
import { createHash, randomBytes, randomInt } from "crypto";
import * as bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwt: JwtService,
    private crypto: FieldCryptoService,
    private sms: SmsService,
  ) {}

  async register(
    displayName: string,
    username: string,
    password: string,
    deviceId: string,
  ) {
    const normalizedUsername = username.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("این نام کاربری قبلاً ثبت شده است");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          displayName: displayName.trim(),
          username: normalizedUsername,
          passwordHash,
          phone: null,
          phoneHash: null,
        },
      });

      return this.issueTokens(user.id, deviceId);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("این نام کاربری قبلاً ثبت شده است");
      }

      throw error;
    }
  }

  async setPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, isBanned: true },
    });

    if (!user) {
      throw new UnauthorizedException("حساب کاربری یافت نشد");
    }

    if (user.isBanned) {
      throw new ForbiddenException("حساب شما مسدود شده است");
    }

    if (user.passwordHash) {
      throw new ConflictException("برای این حساب قبلاً رمز اختصاصی ثبت شده است");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await this.prisma.user.updateMany({
      where: { id: userId, passwordHash: null },
      data: { passwordHash },
    });

    if (result.count !== 1) {
      throw new ConflictException("رمز اختصاصی قبلاً برای این حساب ثبت شده است");
    }

    return { ok: true, message: "رمز اختصاصی با موفقیت ثبت شد" };
  }

  async login(username: string, password: string, deviceId: string) {
    const normalizedUsername = username.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (
      !user ||
      !user.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException(
        "نام کاربری یا رمز اختصاصی نادرست است",
      );
    }

    if (user.isBanned) {
      throw new ForbiddenException("حساب شما مسدود شده است");
    }

    return this.issueTokens(user.id, deviceId);
  }

  async checkUsername(username: string) {
    const normalized = username.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { username: normalized },
      select: { id: true },
    });

    return { available: !user };
  }

  generatePassword() {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const digits = "0123456789";
    const symbols = "!@#$%^&*()-_=+[]{}?";

    const all = lower + upper + digits + symbols;
    const pick = (chars: string) => chars[randomInt(chars.length)];

    const chars = [
      pick(lower),
      pick(upper),
      pick(digits),
      pick(symbols),
    ];

    while (chars.length < 12) {
      chars.push(pick(all));
    }

    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return { password: chars.join("") };
  }

  private hashOtp(code: string) {
    return createHash("sha256").update(code).digest("hex");
  }
  // src/auth/auth.service.ts
  async requestOtp(phone: string) {
    // ۱. محدودیت نرخ (Rate Limiting)
    const rateKey = `otp:rate:${phone}`;
    const count = await this.redis.incr(rateKey);
    if (count === 1) await this.redis.expire(rateKey, 600);
    if (count > 3)
      throw new BadRequestException(
        "تعداد درخواست‌ها زیاد است. بعداً تلاش کنید.",
      );

    // ⭐️⭐️⭐️ حیاتی: تعریف متغیر code در اینجا ⭐️⭐️⭐️
    // اگر قبلاً اسمش otp بود، اینجا هم بنویس otp و در پایین هم otp بزن.
    const code = randomInt(10000, 99999).toString();

    const codeHash = this.hashOtp(code);

    // ۲. ذخیره هش کد در رِدیس
    await this.redis.set(`otp:${phone}`, codeHash, "EX", 120);

    // ۳. ارسال پیامک (حالا متغیر code وجود دارد)
    const result = await this.sms.sendOtp(phone, code);

    // ۴. برگرداندن پاسخ
    return {
      ok: true,
      message: "کد تأیید ارسال شد.",
      debugCode: result.debugCode, // اگر در حالت Fallback بود
    };
  }
  async verifyOtp(phone: string, code: string, deviceId: string) {
    const stored = await this.redis.get(`otp:${phone}`);
    if (!stored) throw new UnauthorizedException("کد منقضی شده است");

    if (this.hashOtp(code) !== stored)
      throw new UnauthorizedException("کد وارد شده اشتباه است");

    await this.redis.del(`otp:${phone}`);

    const phoneHash = this.crypto.hash(phone);
    let user = await this.prisma.user.findUnique({ where: { phoneHash } });

    if (!user) {
      const enc = this.crypto.encrypt(phone);
      user = await this.prisma.user.create({
        data: { phone: enc.cipherText, phoneHash },
      });
    }

    if (user.isBanned) throw new ForbiddenException("حساب شما مسدود شده است");

    return this.issueTokens(user.id, deviceId);
  }

  private async issueTokens(userId: string, deviceId: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId });

    const raw = randomBytes(48).toString("base64url");
    const tokenHash = await bcrypt.hash(raw, 10);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        deviceId,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    return { accessToken, refreshToken: `${userId}.${raw}` };
  }

  async refresh(token: string, deviceId: string) {
    const parts = token.split(".");
    if (parts.length !== 2) throw new UnauthorizedException("توکن نامعتبر");
    const [userId, raw] = parts;

    const record = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        deviceId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!record) throw new UnauthorizedException("نشست یافت نشد");

    const ok = await bcrypt.compare(raw, record.tokenHash);
    if (!ok) {
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      });
      throw new UnauthorizedException("توکن نامعتبر. همه نشست‌ها بسته شدند.");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });

    return this.issueTokens(userId, deviceId);
  }

  async logout(userId: string, deviceId?: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, ...(deviceId ? { deviceId } : {}) },
      data: { revoked: true },
    });
    return { ok: true };
  }
}
