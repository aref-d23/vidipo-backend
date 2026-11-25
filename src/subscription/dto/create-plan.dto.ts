import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Min } from "class-validator";

export class CreatePlanDto {
  @IsString()
  @Length(2, 50)
  name!: string;

  @IsInt()
  @Min(1000)
  price!: number;

  @IsInt()
  @Min(1)
  duration!: number;

  @IsObject()
  features!: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}