import { IsString, Length } from "class-validator";

export class RefreshDto {
  @IsString()
  refreshToken!: string;

  @IsString()
  @Length(1, 128)
  deviceId!: string;
}