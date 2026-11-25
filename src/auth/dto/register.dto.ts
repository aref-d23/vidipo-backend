import { IsString, Length, Matches } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(2, 60)
  displayName!: string;

  @IsString()
  @Length(3, 30)
  @Matches(/^[a-z0-9_]+$/, {
    message: "نام کاربری فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و _ باشد",
  })
  username!: string;

  @IsString()
  @Length(12, 12, {
    message: "رمز اختصاصی باید دقیقاً ۱۲ کاراکتر باشد",
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12}$/, {
    message: "رمز باید شامل حروف کوچک و بزرگ انگلیسی، عدد و نماد باشد",
  })
  password!: string;

  @IsString()
  @Length(1, 128)
  deviceId!: string;
}
