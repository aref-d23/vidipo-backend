import { IsString, Matches, Length } from "class-validator";

export class VerifyOtpDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: "شماره موبایل نامعتبر است" })
  phone!: string;

  @IsString()
  @Length(5, 5, { message: "کد باید ۵ رقم باشد" })
  code!: string;

  @IsString()
  @Length(1, 128)
  deviceId!: string;
}
