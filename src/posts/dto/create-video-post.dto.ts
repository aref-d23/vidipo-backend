import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateVideoPostDto {
  @IsString()
  @IsNotEmpty()
  videoUrl!: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  content?: string;
}
