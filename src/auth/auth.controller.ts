import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { CheckUsernameDto } from "./dto/check-username.dto";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { JwtGuard } from "../common/guards/jwt.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password, dto.deviceId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(
      dto.displayName,
      dto.username,
      dto.password,
      dto.deviceId,
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("username/check")
  checkUsername(@Body() dto: CheckUsernameDto) {
    return this.auth.checkUsername(dto.username);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("password/generate")
  generatePassword() {
    return this.auth.generatePassword();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("otp/request")
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("otp/verify")
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.deviceId);
  }

  @Public()
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken, dto.deviceId);
  }

  @UseGuards(JwtGuard)
  @Post("set-password")
  setPassword(
    @CurrentUser("id") userId: string,
    @Body() dto: SetPasswordDto,
  ) {
    return this.auth.setPassword(userId, dto.password);
  }

  @UseGuards(JwtGuard)
  @Post("logout")
  logout(@CurrentUser("id") userId: string, @Body() body: { deviceId?: string }) {
    return this.auth.logout(userId, body?.deviceId);
  }
}