import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { SubscriptionService } from "./subscription.service";
import { JwtGuard } from "../common/guards/jwt.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { Role } from "@prisma/client";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { BuyPlanDto } from "./dto/buy-plan.dto";

@Controller("subscription")
export class SubscriptionController {
  constructor(private sub: SubscriptionService) {}

  // ============ Public ============
  @Public()
  @Get("plans")
  listPlans() {
    return this.sub.listPlans(true);
  }

  // ============ Authenticated ============
  @UseGuards(JwtGuard)
  @Get("me")
  mySubscription(@CurrentUser("id") userId: string) {
    return this.sub.mySubscription(userId);
  }

  @UseGuards(JwtGuard)
  @Post("buy")
  buy(@CurrentUser("id") userId: string, @Body() dto: BuyPlanDto) {
    return this.sub.createPayment(userId, dto.planId);
  }

  @UseGuards(JwtGuard)
  @Get("payments")
  myPayments(@CurrentUser("id") userId: string) {
    return this.sub.myPayments(userId);
  }

  // ============ Zarinpal Callback ============
  @Public()
  @Get("callback")
  async callback(
    @Query("Authority") authority: string,
    @Query("Status") status: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.sub.verifyPayment(authority, status);
      const webUrl = process.env.WEB_URL ?? "http://localhost:3002";
      return res.redirect(
        webUrl + "/payment/success?refId=" + (result.refId ?? "") + "&authority=" + authority,
      );
    } catch (e: any) {
      const webUrl = process.env.WEB_URL ?? "http://localhost:3002";
      return res.redirect(
        webUrl + "/payment/failed?authority=" + authority + "&reason=" + encodeURIComponent(e.message ?? ""),
      );
    }
  }

  // ============ Admin ============
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post("plans")
  createPlan(@Body() dto: CreatePlanDto) {
    return this.sub.createPlan(dto);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch("plans/:id")
  updatePlan(@Param("id") id: string, @Body() dto: Partial<CreatePlanDto>) {
    return this.sub.updatePlan(id, dto);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete("plans/:id")
  deletePlan(@Param("id") id: string) {
    return this.sub.deletePlan(id);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get("plans/all")
  allPlans() {
    return this.sub.listPlans(false);
  }
}