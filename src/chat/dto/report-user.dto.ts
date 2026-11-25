import { IsOptional, IsString, Length } from "class-validator";

export class ReportUserDto {
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsString()
  @Length(1, 100)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  details?: string;
}
