import { IsString, Length, Matches } from "class-validator";

export class CheckUsernameDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد و _ باشد",
  })
  username!: string;
}
