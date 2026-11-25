import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding plans...");
  const plans = [
    { name: "نقره‌ای", price: 49000, duration: 30, features: { ads: false, badge: "silver", storiesLimit: 50 } },
    { name: "طلایی", price: 129000, duration: 30, features: { ads: false, badge: "gold", storiesLimit: 200, verified: true } },
    { name: "الماس", price: 299000, duration: 90, features: { ads: false, badge: "diamond", storiesLimit: -1, verified: true, priority: true } },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({ where: { name: p.name }, create: p, update: p });
  }
  console.log("✅ Seed completed");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());