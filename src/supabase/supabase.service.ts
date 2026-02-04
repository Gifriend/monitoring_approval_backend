import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.bucketName = this.configService.get<string>('SUPABASE_BUCKET') || 'documents';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Key must be provided in environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger.log('Supabase client initialized');
  }

  /**
   * Upload file to Supabase Storage
   * @param file - Buffer or File to upload
   * @param fileName - Name of the file to store
   * @param folder - Optional folder path (default: 'documents')
   * @returns Object with publicUrl and path
   */
  async uploadFile(
    file: Buffer | Express.Multer.File,
    fileName: string,
    folder: string = 'documents',
  ): Promise<{ publicUrl: string; path: string }> {
    try {
      const fileBuffer = Buffer.isBuffer(file) ? file : file.buffer;
      const filePath = `${folder}/${fileName}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, fileBuffer, {
          contentType: this.getContentType(fileName),
          upsert: false, // Set true jika ingin replace file yang sama
        });

      if (error) {
        this.logger.error(`Upload error: ${error.message}`);
        throw new BadRequestException(`Failed to upload file: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      return {
        publicUrl: urlData.publicUrl,
        path: data.path,
      };
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Download file from Supabase Storage
   * @param filePath - Path to file in storage
   * @returns File buffer
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .download(filePath);

      if (error) {
        this.logger.error(`Download error: ${error.message}`);
        throw new BadRequestException(`Failed to download file: ${error.message}`);
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error(`Download failed: ${error.message}`);
      throw new BadRequestException(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Delete file from Supabase Storage
   * @param filePath - Path to file in storage
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        this.logger.error(`Delete error: ${error.message}`);
        throw new BadRequestException(`Failed to delete file: ${error.message}`);
      }

      this.logger.log(`File deleted: ${filePath}`);
    } catch (error) {
      this.logger.error(`Delete failed: ${error.message}`);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get public URL for a file
   * @param filePath - Path to file in storage
   * @returns Public URL
   */
  getPublicUrl(filePath: string): string {
    const { data } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);
    return data.publicUrl;
  }

  /**
   * Generate signed URL with expiration
   * @param filePath - Path to file in storage
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   * @returns Signed URL
   */
  async getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        this.logger.error(`Signed URL error: ${error.message}`);
        throw new BadRequestException(`Failed to generate signed URL: ${error.message}`);
      }

      return data.signedUrl;
    } catch (error) {
      this.logger.error(`Signed URL generation failed: ${error.message}`);
      throw new BadRequestException(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * List files in a folder
   * @param folder - Folder path
   * @returns List of files
   */
  async listFiles(folder: string = ''): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(folder);

      if (error) {
        this.logger.error(`List files error: ${error.message}`);
        throw new BadRequestException(`Failed to list files: ${error.message}`);
      }

      return data;
    } catch (error) {
      this.logger.error(`List files failed: ${error.message}`);
      throw new BadRequestException(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext) return 'application/octet-stream';
    
    const contentTypes: { [key: string]: string } = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}
