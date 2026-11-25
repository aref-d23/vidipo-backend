import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePlanDto } from "./dto/create-plan.dto";

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService, private cfg: ConfigService) {}

  // ============ Plans ============
  async listPlans(onlyActive = true) {
    return this.prisma.plan.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: { price: "asc" },
    });
  }

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.plan.create({ data: dto });
  }

  async updatePlan(id: string, dto: Partial<CreatePlanDto>) {
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  async deletePlan(id: string) {
    await this.prisma.plan.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  // ============ My subscription ============
  async mySubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!sub) return { subscription: null };

    if (sub.endAt < new Date() && sub.status === "ACTIVE") {
      await this.prisma.subscription.update({
        where: { userId },
        data: { status: "EXPIRED" },
      });
      return { subscription: { ...sub, status: "EXPIRED" } };
    }

    return { subscription: sub };
  }

  async hasActiveSubscription(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub) return false;
    return sub.status === "ACTIVE" && sub.endAt > new Date();
  }

  // ============ Zarinpal Payment ============
  private get zarinpalBase() {
    return this.cfg.get<boolean>("zarinpal.sandbox")
      ? "https://sandbox.zarinpal.com"
      : "https://payment.zarinpal.com";
  }

  private get zarinpalApi() {
    return this.cfg.get<boolean>("zarinpal.sandbox")
      ? "https://sandbox.zarinpal.com"
      : "https://api.zarinpal.com";
  }

  async createPayment(userId: string, planId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException("پلن یافت نشد");

    const merchantId = this.cfg.get<string>("zarinpal.merchantId");
    if (!merchantId) throw new BadRequestException("درگاه پرداخت پیکربندی نشده است");

    // ایجاد رکورد پرداخت
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        planId: plan.id,
        amount: plan.price,
        status: "PENDING",
      },
    });

    const callbackUrl = (this.cfg.get<string>("apiUrl") ?? "http://localhost:3000") + "/api/subscription/callback";

    try {
      const res = await fetch(this.zarinpalApi + "/pg/v4/payment/request.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: plan.price * 10, // تبدیل تومان به ریال
          description: "خرید اشتراک " + plan.name,
          callback_url: callbackUrl,
          metadata: { user_id: userId, plan_id: plan.id },
        }),
      });

      const data = await res.json();

      if (data?.data?.authority) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { authority: data.data.authority },
        });

        return {
          paymentId: payment.id,
          authority: data.data.authority,
          url: this.zarinpalBase + "/pg/StartPay/" + data.data.authority,
        };
      }

      // خطا در ساخت پرداخت
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      throw new BadRequestException(data?.errors?.message ?? "خطا در ایجاد پرداخت");
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      throw new BadRequestException("خطا در ارتباط با درگاه پرداخت");
    }
  }

  async verifyPayment(authority: string, status?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { authority },
      include: { user: true },
    });

    if (!payment) throw new NotFoundException("پرداخت یافت نشد");
    if (payment.status === "PAID") return { ok: true, alreadyPaid: true, refId: payment.refId };
    if (status && status !== "OK") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      throw new BadRequestException("پرداخت لغو شد");
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: payment.planId } });
    if (!plan) throw new NotFoundException("پلن یافت نشد");

    const merchantId = this.cfg.get<string>("zarinpal.merchantId")!;

    try {
      const res = await fetch(this.zarinpalApi + "/pg/v4/payment/verify.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: payment.amount * 10,
          authority,
        }),
      });

      const data = await res.json();

      if (data?.data?.code === 100 || data?.data?.code === 101) {
        const refId = String(data.data.ref_id);

        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "PAID", refId },
          });

          const existing = await tx.subscription.findUnique({
            where: { userId: payment.userId },
          });

          // اگه اشتراک فعال داشتیم، تمدید کن. وگرنه اشتراک جدید بساز
          if (existing && existing.status === "ACTIVE" && existing.endAt > new Date()) {
            const newEnd = new Date(existing.endAt.getTime() + plan.duration * 86400000);
            await tx.subscription.update({
              where: { userId: payment.userId },
              data: { endAt: newEnd, planId: plan.id, status: "ACTIVE" },
            });
          } else {
            const endAt = new Date(Date.now() + plan.duration * 86400000);
            await tx.subscription.upsert({
              where: { userId: payment.userId },
              create: { userId: payment.userId, planId: plan.id, endAt, status: "ACTIVE" },
              update: { planId: plan.id, endAt, status: "ACTIVE" },
            });
          }
        });

        return { ok: true, refId };
      } else {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        });
        throw new BadRequestException(data?.errors?.message ?? "تایید پرداخت ناموفق");
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("خطا در تایید پرداخت");
    }
  }

  async myPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { name: true, duration: true } } },
    });
  }
}