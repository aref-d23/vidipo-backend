import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Role, ReportStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtGuard } from "../common/guards/jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";

@Controller("admin")
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get("stats")
  async stats() {
    const [users, posts, stories, revenue, openReports] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.story.count(),
      this.prisma.payment.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      this.prisma.report.count({ where: { status: "OPEN" } }),
    ]);
    return {
      users,
      posts,
      stories,
      revenue: revenue._sum.amount ?? 0,
      openReports,
    };
  }

  // ============ Users ============
  @Get("users")
  users(@Query("q") q?: string) {
    return this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        isBanned: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }

  @Patch("users/:id/ban")
  @Roles(Role.ADMIN)
  ban(@Param("id") id: string, @Body() body: { ban: boolean }) {
    return this.prisma.user.update({
      where: { id },
      data: { isBanned: body.ban },
      select: { id: true, isBanned: true },
    });
  }

  @Patch("users/:id/role")
  @Roles(Role.ADMIN)
  setRole(@Param("id") id: string, @Body() body: { role: Role }) {
    return this.prisma.user.update({
      where: { id },
      data: { role: body.role },
      select: { id: true, role: true },
    });
  }

  // ============ Reports ============
  @Get("reports")
  reports(@Query("status") status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        reported: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  @Patch("reports/:id")
  resolveReport(@Param("id") id: string, @Body() body: { status: ReportStatus }) {
    return this.prisma.report.update({ where: { id }, data: { status: body.status } });
  }

  // ============ Posts ============
  @Get("posts")
  posts(@Query("q") q?: string) {
    return this.prisma.post.findMany({
      where: q ? { content: { contains: q, mode: "insensitive" } } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  @Patch("posts/:id/hide")
  hidePost(@Param("id") id: string, @Body() body: { hide: boolean }) {
    return this.prisma.post.update({
      where: { id },
      data: { isHidden: body.hide },
    });
  }

  @Delete("posts/:id")
  @Roles(Role.ADMIN)
  deletePost(@Param("id") id: string) {
    return this.prisma.post.delete({ where: { id } });
  }

  // ============ Stories ============
  @Get("stories")
  stories() {
    return this.prisma.story.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  @Delete("stories/:id")
  @Roles(Role.ADMIN)
  deleteStory(@Param("id") id: string) {
    return this.prisma.story.delete({ where: { id } });
  }
}