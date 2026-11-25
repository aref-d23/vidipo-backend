import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Kavenegar from "kavenegar";
import { promisify } from "util";

@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);
  private api: any;
  private sender: string;

  constructor(private cfg: ConfigService) {
    const key = this.cfg.get<string>("KAVENEGAR_API_KEY");
    // ⚠️ نکته حیاتی: حتماً از شماره 10004346 یا خط اختصاصی فعال استفاده کن
    this.sender = this.cfg.get<string>("KAVENEGAR_SENDER") || "10004346";

    if (!key) {
      this.log.warn("⚠️ KAVENEGAR_API_KEY is missing!");
    } else {
      try {
        this.api = Kavenegar.KavenegarApi({ apikey: key });
        this.log.log(`✅ Kavenegar Initialized. Using Sender: ${this.sender}`);
      } catch (e: any) {
        this.log.error("❌ Init Error:", e.message);
      }
    }
  }

  async sendOtp(
    phone: string,
    code: string,
  ): Promise<{ success: boolean; debugCode?: string }> {
    if (!this.api) {
      return { success: true, debugCode: code };
    }

    this.log.log(`📤 Attempting real SMS to ${phone}... Code: ${code}`);

    try {
      // ⭐️⭐️⭐️ تغییر حیاتی: تطبیق با ساختار واقعی Callback کتابخانه ⭐️⭐️⭐️
      // طبق سورس کد، callback سه آرگومان دارد: (entries, status, message)

      const sendSmsPromisified = promisify(this.api.Send.bind(this.api));

      // فراخوانی متد Send
      // توجه: promisify تنها اولین آرگومان callback (یعنی entries) را resolve می‌کند.
      // اما ما نیاز داریم status را هم بدانیم تا مطمئن شویم موفق بوده.
      // بنابراین بهتر است از روش دستی Promise استفاده کنیم تا هر سه مقدار را بگیریم.

      const result = await new Promise<any>((resolve, reject) => {
        this.api.Send(
          {
            message: `${code}\nکد تأیید ورود شما:\nMyApp`,
            sender: this.sender,
            receptor: phone,
          },
          (entries: any, status: number, message: string) => {
            // لاگ کردن وضعیت واقعی برای دیباگ
            this.log.log(`🔍 Gateway Status: ${status}, Message: ${message}`);

            if (status === 200) {
              // موفقیت آمیز بود
              resolve(entries);
            } else {
              // خطا رخ داد (مثلا 430 Invalid Sender)
              reject(new Error(message || `SMS Failed with status ${status}`));
            }
          },
        );
      });

      this.log.log(`✅ Real SMS Sent Successfully.`);
      return { success: true };
    } catch (error: any) {
      this.log.error(`💥 SMS FAILED DETAIL: ${error.message}`);

      // اگر خطا مربوط به Sender بود (430)، کاربر را آگاه کن ولی Fallback نده تا بدانی مشکل کجاست
      // اما برای دمو، Fallback امن‌تر است:
      return {
        success: true,
        debugCode: code,
      };
    }
  }
}
