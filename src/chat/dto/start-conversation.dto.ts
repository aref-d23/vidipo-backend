import { IsString, Length } from "class-validator";

export class StartConversationDto {
  @IsString()
  @Length(1, 64)
  userId!: string;
}