import { IsString, Length, Matches } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "نام کاربری نامعتبر است",
  })
  username!: string;

  @IsString()
  @Length(12, 12, {
    message: "رمز اختصاصی باید دقیقاً ۱۲ کاراکتر باشد",
  })
  password!: string;

  @IsString()
  @Length(1, 128)
  deviceId!: string;
}
