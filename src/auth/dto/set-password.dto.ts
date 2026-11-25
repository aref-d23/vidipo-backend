import { IsString, Length, Matches } from "class-validator";

export class SetPasswordDto {
  @IsString()
  @Length(12, 12, {
    message: "رمز اختصاصی باید دقیقاً ۱۲ کاراکتر باشد",
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12}$/, {
    message: "رمز باید شامل حروف کوچک و بزرگ انگلیسی، عدد و نماد باشد",
  })
  password!: string;
}
