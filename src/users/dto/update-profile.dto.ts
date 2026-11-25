import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 30)
  username?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(120)
  age?: number;
}