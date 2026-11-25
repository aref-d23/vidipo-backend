import { IsBoolean, IsOptional } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  isGhostMode?: boolean;

  @IsOptional()
  @IsBoolean()
  hideReadReceipts?: boolean;
}
