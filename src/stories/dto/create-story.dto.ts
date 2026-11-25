import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class CreateStoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @Length(4, 20)
  background?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  caption?: string;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(15)
  duration?: number;

  @IsOptional()
  @IsArray()
  textOverlays?: any[];

  @IsOptional()
  @IsArray()
  drawings?: any[];

  @IsOptional()
  @IsArray()
  stickers?: any[];

  @IsOptional()
  @IsBoolean()
  closeFriendsOnly?: boolean;
}