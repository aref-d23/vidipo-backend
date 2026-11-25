export default () => ({
  port: parseInt(process.env.PORT ?? "3000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiUrl: process.env.API_URL,
  adminUrl: process.env.ADMIN_URL,
  webUrl: process.env.WEB_URL,
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  database: { url: process.env.DATABASE_URL! },
  redis: { url: process.env.REDIS_URL! },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT!,
    port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
    bucket: process.env.MINIO_BUCKET ?? "myapp",
    publicUrl:
      process.env.MINIO_PUBLIC_URL ??
      `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT ?? "9000"}`,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessTtl: "15m",
    refreshTtl: "30d",
  },
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY!,
  sms: {
    provider: process.env.SMS_PROVIDER ?? "mock",
    kavenegarKey: process.env.KAVENEGAR_API_KEY,
    kavenegarSender: process.env.KAVENEGAR_SENDER,
  },
  zarinpal: {
    merchantId: process.env.ZARINPAL_MERCHANT_ID,
    sandbox: process.env.ZARINPAL_SANDBOX === "true",
  },
});