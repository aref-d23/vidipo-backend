import { IsString, Length } from "class-validator";

export class BuyPlanDto {
  @IsString()
  @Length(1, 64)
  planId!: string;
}