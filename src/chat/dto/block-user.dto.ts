import { IsString, Length } from "class-validator";

export class BlockUserDto {
  @IsString()
  @Length(1, 64)
  userId!: string;
}