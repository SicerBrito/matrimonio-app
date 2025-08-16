import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BunnyStorageService, BatchUploadResult } from '../../services/bunny-storage.service';

interface FileWithPreview {
  file: File;
  originalFile: File; // Archivo original antes de compresión
  previewUrl: string | ArrayBuffer | null;
  isVideo: boolean;
  uploadProgress: number;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadError?: string;
  id: string;
  compressed?: boolean;
}

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss']
})
export class FileUploadComponent implements OnInit {
  uploadForm: FormGroup;
  selectedFiles: FileWithPreview[] = [];
  isUploading = false;
  globalUploadProgress = 0;
  uploadError: string | null = null;
  allFilesUploaded = false;
  
  // Configuración mejorada
  readonly MAX_FILE_SIZE = 5 *1024 * 1024 * 1024; // 5 GB
  readonly MAX_FILES = 50; // Máximo 50 archivos
  readonly ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ];

  // Configuración de compresión
  readonly COMPRESS_IMAGES = true;
  readonly MAX_IMAGE_WIDTH = 2560;
  readonly IMAGE_QUALITY = 0.90;

  constructor(
    private fb: FormBuilder,
    private bunnyStorage: BunnyStorageService
  ) {
    this.uploadForm = this.fb.group({
      files: [null, [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Inicialización
  }

  /**
   * Maneja la selección de múltiples archivos con validación mejorada
   */
  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    
    if (input.files && input.files.length) {
      const newFiles = Array.from(input.files);
      
      // Verificar límite de archivos
      if (this.selectedFiles.length + newFiles.length > this.MAX_FILES) {
        this.uploadError = `Máximo ${this.MAX_FILES} archivos permitidos`;
        return;
      }
      
      // Validar archivos usando el servicio
      const { valid, invalid } = this.bunnyStorage.validateFiles(newFiles);
      
      // Mostrar errores de archivos inválidos
      if (invalid.length > 0) {
        this.uploadError = `Archivos rechazados: ${invalid.map(i => `${i.file.name} (${i.reason})`).join(', ')}`;
        if (valid.length === 0) return;
      }
      
      // Procesar archivos válidos
      this.uploadError = null;
      await this.processValidFiles(valid);
      
      // Actualizar el FormControl
      this.updateFilesFormControl();
    }
  }

  /**
   * Procesa archivos válidos, incluyendo compresión si está habilitada
   */
  private async processValidFiles(files: File[]): Promise<void> {
    const processPromises = files.map(async (file) => {
      let processedFile = file;
      let compressed = false;

      // Comprimir imágenes si está habilitado
      if (this.COMPRESS_IMAGES && file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
        try {
          processedFile = await this.bunnyStorage.compressImage(
            file, 
            this.MAX_IMAGE_WIDTH, 
            this.IMAGE_QUALITY
          );
          compressed = processedFile.size !== file.size;
        } catch (error) {
          console.warn('Error al comprimir imagen, usando original:', error);
          processedFile = file;
        }
      }

      // Crear objeto FileWithPreview
      const fileWithPreview: FileWithPreview = {
        file: processedFile,
        originalFile: file,
        previewUrl: null,
        isVideo: file.type.startsWith('video/'),
        uploadProgress: 0,
        uploadStatus: 'pending',
        id: this.generateFileId(),
        compressed
      };

      // Generar preview
      await this.createFilePreview(fileWithPreview);
      
      return fileWithPreview;
    });

    // Esperar a que todos los archivos se procesen
    const processedFiles = await Promise.all(processPromises);
    this.selectedFiles.push(...processedFiles);
  }

  /**
   * Genera un ID único para cada archivo
   */
  private generateFileId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Crea una vista previa del archivo (ahora async)
   */
  private createFilePreview(fileWithPreview: FileWithPreview): Promise<void> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        fileWithPreview.previewUrl = reader.result;
        resolve();
      };
      
      reader.onerror = () => resolve(); // Continuar aunque falle la preview
      
      reader.readAsDataURL(fileWithPreview.file);
    });
  }

  /**
   * Actualiza el FormControl de archivos
   */
  private updateFilesFormControl(): void {
    const hasFiles = this.selectedFiles.length > 0;
    this.uploadForm.get('files')?.setValue(hasFiles ? this.selectedFiles : null);
  }

  /**
   * Remueve un archivo específico de la lista
   */
  removeFile(fileId: string): void {
    this.selectedFiles = this.selectedFiles.filter(f => f.id !== fileId);
    this.updateFilesFormControl();
    this.resetFileInput();
  }

  /**
   * Remueve todos los archivos
   */
  removeAllFiles(): void {
    this.selectedFiles = [];
    this.updateFilesFormControl();
    this.uploadError = null;
    this.resetFileInput();
  }

  /**
   * Resetea el input file
   */
  private resetFileInput(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /**
   * Maneja el envío del formulario con subidas paralelas
   */
  onSubmit(): void {
    if (this.uploadForm.invalid || this.selectedFiles.length === 0) {
      return;
    }
        
    // Iniciar la subida
    this.isUploading = true;
    this.globalUploadProgress = 0;
    this.allFilesUploaded = false;
    this.uploadError = null;
    
    // Resetear el estado de todos los archivos
    this.selectedFiles.forEach(file => {
      file.uploadStatus = 'uploading';
      file.uploadProgress = 0;
      file.uploadError = undefined;
    });
    
    // Extraer archivos para subir
    const filesToUpload = this.selectedFiles.map(f => f.file);
    
    // Subir archivos en paralelo
    this.bunnyStorage.uploadMultipleFiles(
      filesToUpload, 
      'wedding',
      (overallProgress, fileProgresses) => {
        // Actualizar progreso global
        this.globalUploadProgress = overallProgress;
        
        // Actualizar progreso individual de cada archivo
        fileProgresses.forEach((fileProgress, index) => {
          if (this.selectedFiles[index]) {
            this.selectedFiles[index].uploadProgress = fileProgress.progress;
            this.selectedFiles[index].uploadStatus = fileProgress.success ? 'success' : 
              (fileProgress.error ? 'error' : 'uploading');
            this.selectedFiles[index].uploadError = fileProgress.error;
          }
        });
      }
    ).subscribe({
      next: (results: BatchUploadResult[]) => {
        // Proceso completado
        this.isUploading = false;
        
        // Actualizar estado final de cada archivo
        results.forEach((result, index) => {
          if (this.selectedFiles[index]) {
            this.selectedFiles[index].uploadStatus = result.success ? 'success' : 'error';
            this.selectedFiles[index].uploadError = result.error;
            this.selectedFiles[index].uploadProgress = result.success ? 100 : 0;
          }
        });
        
        // Verificar si todos los archivos se subieron correctamente
        this.allFilesUploaded = this.selectedFiles.every(f => f.uploadStatus === 'success');
        
        if (this.allFilesUploaded) {
          // Resetear después de un breve retraso
          setTimeout(() => {
            this.resetForm();
          }, 3000);
        } else {
          // Mostrar errores
          const failedFiles = this.selectedFiles.filter(f => f.uploadStatus === 'error').length;
          this.uploadError = `${failedFiles} archivo(s) no se pudieron subir. Revisa los errores individuales.`;
        }
      },
      error: (error) => {
        this.isUploading = false;
        this.uploadError = error.message || 'Error general en la subida';
        console.error('Error en subida múltiple:', error);
      }
    });
  }

  /**
   * Resetea el formulario completo
   */
  resetForm(): void {
    this.uploadForm.reset();
    this.removeAllFiles();
    this.allFilesUploaded = false;
    this.uploadError = null;
    this.isUploading = false;
    this.globalUploadProgress = 0;
  }

  /**
   * Obtiene el ícono de estado para un archivo
   */
  getFileStatusIcon(file: FileWithPreview): string {
    switch (file.uploadStatus) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'uploading':
        return '⏳';
      default:
        return '📎';
    }
  }

  /**
   * Obtiene la clase CSS para el estado del archivo
   */
  getFileStatusClass(file: FileWithPreview): string {
    return `file-status-${file.uploadStatus}`;
  }

  /**
   * Obtiene información de compresión para mostrar al usuario
   */
  getCompressionInfo(file: FileWithPreview): string {
    if (!file.compressed) return '';
    
    const originalSize = (file.originalFile.size / 1024 / 1024).toFixed(1);
    const compressedSize = (file.file.size / 1024 / 1024).toFixed(1);
    const savings = ((1 - file.file.size / file.originalFile.size) * 100).toFixed(0);
    
    return `Comprimido: ${originalSize}MB → ${compressedSize}MB (${savings}% menos)`;
  }

  /**
   * Reintenta subir archivos fallidos
   */
  retryFailedUploads(): void {
    const failedFiles = this.selectedFiles.filter(f => f.uploadStatus === 'error');
    if (failedFiles.length === 0) return;

    // Resetear estado de archivos fallidos
    failedFiles.forEach(file => {
      file.uploadStatus = 'pending';
      file.uploadProgress = 0;
      file.uploadError = undefined;
    });

    // Solo subir los archivos fallidos
    const filesToRetry = failedFiles.map(f => f.file);
    this.isUploading = true;

    this.bunnyStorage.uploadMultipleFiles(
      filesToRetry,
      'wedding',
      (overallProgress, fileProgresses) => {
        // Actualizar solo los archivos que se están reintentando
        let retryIndex = 0;
        failedFiles.forEach((file) => {
          const fileIndex = this.selectedFiles.findIndex(f => f.id === file.id);
          if (fileIndex !== -1 && retryIndex < fileProgresses.length) {
            const progress = fileProgresses[retryIndex];
            this.selectedFiles[fileIndex].uploadProgress = progress.progress;
            this.selectedFiles[fileIndex].uploadStatus = progress.success ? 'success' : 
              (progress.error ? 'error' : 'uploading');
            this.selectedFiles[fileIndex].uploadError = progress.error;
            retryIndex++;
          }
        });
      }
    ).subscribe({
      next: (results) => {
        this.isUploading = false;
        this.allFilesUploaded = this.selectedFiles.every(f => f.uploadStatus === 'success');
      },
      error: (error) => {
        this.isUploading = false;
        this.uploadError = 'Error al reintentar subida: ' + error.message;
      }
    });
  }
}