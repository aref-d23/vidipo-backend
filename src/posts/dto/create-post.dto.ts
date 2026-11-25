import { IsString, IsOptional, IsArray, IsEnum } from "class-validator";
import { PostType } from "@prisma/client"; // ✅ ایمپورت Enum از Prisma Client

export class CreatePostDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(PostType) // بررسی اینکه مقدار TEXT یا VIDEO باشد
  type?: PostType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  category?: string;
}
