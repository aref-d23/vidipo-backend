// backend/src/storage/storage.module.ts
import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service"; // مطمئن شوید نام سرویس درست است

@Global() // ✅ این خط جادویی باعث می‌شود StorageService در کل پروژه قابل دسترسی باشد
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
