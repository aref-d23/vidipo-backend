import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { MessageType } from "@prisma/client";

export class SendMessageDto {
  @IsString()
  @Length(1, 64)
  toUserId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  text?: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  mediaUrl?: string;

  @IsOptional() // ✅ اضافه شد
  @IsString()
  storyOwnerId?: string;
}
