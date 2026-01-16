import { IsArray, IsString, IsOptional } from 'class-validator';

export class SaveAnnotationsDto {
  @IsArray()
  annotations: Array<{
    id: string;
    page: number;
    type: 'draw' | 'text' | 'stamp';
    path?: Array<{ x: number; y: number }>;
    color?: string;
    thickness?: number;
    text?: string;
    fontSize?: number;
    position?: { x: number; y: number };
    stampImage?: string;
    width?: number;
    height?: number;
  }>;

  @IsString()
  @IsOptional()
  documentName?: string;
}