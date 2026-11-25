import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";

import { v4 as uuidv4 } from "uuid";
import * as mime from "mime-types";
import { Readable } from "stream";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  private s3!: S3Client;
  private bucketName: string;
  private endpointUrl: string;
  private publicUrl: string;

  constructor(private configService: ConfigService) {
    // نام باکت
    this.bucketName =
      this.configService.get<string>("S3_BUCKET_NAME") ||
      this.configService.get<string>("MINIO_BUCKET") ||
      "";

    // آدرس داخلی RustFS در شبکه Docker
    const minioHost =
      this.configService.get<string>("MINIO_ENDPOINT") || "minio";

    const minioPort = this.configService.get<string>("MINIO_PORT") || "9000";

    const useSSL = this.configService.get<string>("MINIO_USE_SSL") === "true";

    this.endpointUrl =
      this.configService.get<string>("AWS_ENDPOINT_URL") ||
      `${useSSL ? "https" : "http"}://${minioHost}:${minioPort}`;

    // آدرس عمومی قابل دسترسی از موبایل
    this.publicUrl = (
      this.configService.get<string>("MINIO_PUBLIC_URL") || this.endpointUrl
    ).replace(/\/+$/, "");

    // کلید دسترسی
    const accessKeyId =
      this.configService.get<string>("AWS_ACCESS_KEY_ID") ||
      this.configService.get<string>("MINIO_ACCESS_KEY") ||
      this.configService.get<string>("RUSTFS_ACCESS_KEY");

    const secretAccessKey =
      this.configService.get<string>("AWS_SECRET_ACCESS_KEY") ||
      this.configService.get<string>("MINIO_SECRET_KEY") ||
      this.configService.get<string>("RUSTFS_SECRET_KEY");

    if (!this.bucketName || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "Storage configuration is incomplete. Check MINIO_BUCKET and access credentials.",
      );
    }

    // ساخت کلاینت S3 سازگار با RustFS
    this.s3 = new S3Client({
      region: this.configService.get<string>("AWS_REGION") || "us-east-1",
      endpoint: this.endpointUrl,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });

    this.logger.log(`Storage client initialized. Bucket: ${this.bucketName}`);

    this.logger.log(`Storage endpoint: ${this.endpointUrl}`);
  }

  /**
   * تبدیل خطاهای unknown به اطلاعات قابل استفاده
   */
  private getErrorInfo(error: unknown): {
    message: string;
    name: string;
    statusCode?: number;
  } {
    if (error instanceof Error) {
      const awsError = error as Error & {
        $metadata?: {
          httpStatusCode?: number;
        };
      };

      return {
        message: awsError.message,
        name: awsError.name,
        statusCode: awsError.$metadata?.httpStatusCode,
      };
    }

    return {
      message: String(error),
      name: "UnknownError",
    };
  }

  /**
   * بررسی وجود باکت و آماده‌سازی دسترسی عمومی
   */
  async onModuleInit(): Promise<void> {
    try {
      try {
        await this.s3.send(
          new HeadBucketCommand({
            Bucket: this.bucketName,
          }),
        );

        this.logger.log(`Bucket already exists: ${this.bucketName}`);
      } catch (error) {
        const info = this.getErrorInfo(error);

        // فقط در صورت نبودن باکت، آن را ایجاد می‌کنیم.
        if (info.statusCode !== 404 && info.name !== "NotFound") {
          throw error;
        }

        await this.s3.send(
          new CreateBucketCommand({
            Bucket: this.bucketName,
          }),
        );

        this.logger.log(`Bucket created: ${this.bucketName}`);
      }

      // اجازه خواندن عمومی فایل‌ها
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: ["*"],
            },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${this.bucketName}/*`],
          },
        ],
      };

      await this.s3.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucketName,
          Policy: JSON.stringify(policy),
        }),
      );

      this.logger.log(`Public read policy configured for ${this.bucketName}`);

      this.logger.log(`Storage service ready. Public URL: ${this.publicUrl}`);
    } catch (error) {
      const info = this.getErrorInfo(error);

      this.logger.error(`Storage initialization failed: ${info.message}`);

      throw error;
    }
  }

  /**
   * تعیین پسوند فایل بر اساس MIME Type
   */
  private getExtension(contentType: string): string {
    const extension = mime.extension(contentType);

    return extension ? `.${extension}` : "";
  }

  /**
   * ساخت لینک عمومی فایل
   */
  private buildPublicUrl(key: string): string {
    const encodedKey = key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");

    return `${this.publicUrl}/${this.bucketName}/${encodedKey}`;
  }

  /**
   * آپلود فایل Buffer
   * مثال:
   * uploadBuffer(buffer, 'uploads', 'image/jpeg')
   */
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    contentType: string,
  ): Promise<string> {
    const extension = this.getExtension(contentType);

    const key = `${folder}/${Date.now()}-${uuidv4()}${extension}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
        }),
      );

      this.logger.log(`File uploaded: ${key}`);

      return this.buildPublicUrl(key);
    } catch (error) {
      const info = this.getErrorInfo(error);

      this.logger.error(`Buffer upload failed: ${info.message}`);

      throw new Error(`File upload failed: ${info.message}`);
    }
  }

  /**
   * آپلود فایل Stream
   *
   * پشتیبانی از دو حالت:
   * uploadStream(stream, size, folder, mime)
   * uploadStream(stream, folder, mime)
   */
  async uploadStream(stream: Readable, ...args: any[]): Promise<string> {
    let size: number | undefined;
    let folder: string;
    let contentType: string;

    if (typeof args[0] === "number") {
      size = args[0];
      folder = args[1] || "uploads";
      contentType = args[2] || "application/octet-stream";
    } else {
      folder = args[0] || "uploads";
      contentType = args[1] || "application/octet-stream";
    }

    const extension = this.getExtension(contentType);

    const key = `${folder}/${Date.now()}-${uuidv4()}${extension}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: stream,
          ContentType: contentType,
          ...(size !== undefined ? { ContentLength: size } : {}),
        }),
      );

      this.logger.log(`Stream uploaded: ${key}`);

      return this.buildPublicUrl(key);
    } catch (error) {
      const info = this.getErrorInfo(error);

      this.logger.error(`Stream upload failed: ${info.message}`);

      throw new Error(`Stream upload failed: ${info.message}`);
    }
  }

  /**
   * حذف فایل از فضای ذخیره‌سازی
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const parsedUrl = new URL(fileUrl);

      const pathname = decodeURIComponent(
        parsedUrl.pathname.replace(/^\/+/, ""),
      );

      const prefix = `${this.bucketName}/`;

      if (!pathname.startsWith(prefix)) {
        this.logger.warn(
          "Cannot delete file: URL does not belong to configured bucket.",
        );
        return;
      }

      const key = pathname.slice(prefix.length);

      if (!key) {
        return;
      }

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      const info = this.getErrorInfo(error);

      this.logger.error(`File deletion failed: ${info.message}`);
    }
  }
}
