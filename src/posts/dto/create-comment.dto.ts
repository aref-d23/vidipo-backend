import { IsOptional, IsString, Length } from "class-validator";

export class CreateCommentDto {
  @IsString()
  @Length(1, 300)
  content!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  parentId?: string;
}
