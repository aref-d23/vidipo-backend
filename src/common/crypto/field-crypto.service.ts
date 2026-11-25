// backend/src/common/crypto/field-crypto.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

@Injectable()
export class FieldCryptoService {
  private readonly logger = new Logger(FieldCryptoService.name);
  private readonly key: Buffer;
  private readonly algorithm = "aes-256-gcm"; // GCM برای داشتن authTag

  constructor(private configService: ConfigService) {
    const encryptionKey = this.configService.get<string>(
      "FIELD_ENCRYPTION_KEY",
    );

    if (!encryptionKey) {
      throw new Error("❌ FIELD_ENCRYPTION_KEY is missing in .env file!");
    }

    try {
      this.key = Buffer.from(encryptionKey, "base64");
      if (this.key.length !== 32) {
        this.logger.warn(
          `⚠️ Key length is ${this.key.length}, expected 32 for AES-256.`,
        );
      }
    } catch (error) {
      throw new Error("❌ Invalid FIELD_ENCRYPTION_KEY format.");
    }
  }

  /**
   * هش کردن متن (برای جستجوی امن مثل شماره تلفن)
   */
  hash(text: string): string {
    if (!text) return "";
    return crypto.createHash("sha256").update(text).digest("hex");
  }

  /**
   * رمزنگاری متن
   * ✅ بازگرداندن آبجکت شامل cipherText, iv, authTag
   */
  encrypt(text: string): { cipherText: string; iv: string; authTag: string } {
    if (!text) {
      return { cipherText: "", iv: "", authTag: "" };
    }

    const iv = crypto.randomBytes(12); // 96 bits IV recommended for GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return {
      cipherText: encrypted,
      iv: iv.toString("hex"),
      authTag,
    };
  }

  /**
   * رمزگشایی متن
   * ✅ پذیرش ۳ آرگومان جداگانه طبق نیاز chat.service.ts
   */
  decrypt(cipherText: string, iv: string, authTag: string): string {
    if (!cipherText || !iv || !authTag) return "";

    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(iv, "hex"),
      );

      decipher.setAuthTag(Buffer.from(authTag, "hex"));

      let decrypted = decipher.update(cipherText, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      this.logger.error("Decryption failed:", error);
      return "";
    }
  }
}
