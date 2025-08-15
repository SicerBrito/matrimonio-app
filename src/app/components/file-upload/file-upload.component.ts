import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BunnyStorageService, BatchUploadResult } from '../../services/bunny-storage.service';

interface FileWithPreview {
  file: File;
  originalFile: File;
  previewUrl: string | ArrayBuffer | null;
  isVideo: boolean;
  uploadProgress: number;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadError?: string;
  id: string;
  optimized?: boolean;
  sizeReduction?: number;
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
  estimatedTime: string = '';
  
  // Límites optimizados para Bunny Storage
  readonly MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB por archivo
  readonly MAX_FILES = 50; // Máximo que Bunny puede manejar simultáneamente
  readonly MAX_TOTAL_SIZE = 50 * 1024 * 1024 * 1024; // 50GB total por lote
  
  // Configuración de optimización
  readonly OPTIMIZE_IMAGES = true;
  readonly MAX_IMAGE_WIDTH = 2560; // 2.5K mantiene buena calidad
  readonly IMAGE_QUALITY = 0.92; // Calidad muy alta
  readonly AUTO_OPTIMIZE_THRESHOLD = 2 * 1024 * 1024; // 2MB

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
   * Maneja la selección de archivos con validación avanzada
   */
  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    
    if (input.files && input.files.length) {
      const newFiles = Array.from(input.files);
      
      // Validar límite de archivos
      if (this.selectedFiles.length + newFiles.length > this.MAX_FILES) {
        this.uploadError = `Máximo ${this.MAX_FILES} archivos por lote (límite de Bunny Storage)`;
        return;
      }
      
      // Validar tamaño total
      const currentTotalSize = this.selectedFiles.reduce((sum, f) => sum + f.file.size, 0);
      const newTotalSize = newFiles.reduce((sum, f) => sum + f.size, 0);
      
      if (currentTotalSize + newTotalSize > this.MAX_TOTAL_SIZE) {
        const maxGB = this.MAX_TOTAL_SIZE / (1024 * 1024 * 1024);
        this.uploadError = `Tamaño total máximo: ${maxGB}GB por lote`;
        return;
      }
      
      // Validar archivos usando el servicio
      const { valid, invalid } = this.bunnyStorage.validateFiles(newFiles);
      
      // Mostrar errores de archivos inválidos
      if (invalid.length > 0) {
        this.uploadError = `❌ Archivos rechazados:\n${invalid.map(i => `• ${i.file.name}: ${i.reason}`).join('\n')}`;
        if (valid.length === 0) return;
      }
      
      // Procesar archivos válidos
      this.uploadError = null;
      await this.processValidFiles(valid);
      
      // Calcular tiempo estimado
      this.updateEstimatedTime();
      
      // Actualizar FormControl
      this.updateFilesFormControl();
    }
  }

  /**
   * Procesa y optimiza archivos válidos
   */
  private async processValidFiles(files: File[]): Promise<void> {
    // Mostrar mensaje de procesamiento para archivos grandes
    const hasLargeFiles = files.some(f => f.size > this.AUTO_OPTIMIZE_THRESHOLD);
    if (hasLargeFiles && this.OPTIMIZE_IMAGES) {
      this.uploadError = '⚡ Optimizando archivos grandes...';
    }

    const processPromises = files.map(async (file) => {
      let processedFile = file;
      let optimized = false;
      let sizeReduction = 0;

      // Optimizar imágenes grandes automáticamente
      if (this.OPTIMIZE_IMAGES && 
          file.type.startsWith('image/') && 
          file.size > this.AUTO_OPTIMIZE_THRESHOLD) {
        try {
          processedFile = await this.bunnyStorage.compressImage(
            file, 
            this.MAX_IMAGE_WIDTH, 
            this.IMAGE_QUALITY
          );
          optimized = processedFile.size !== file.size;
          if (optimized) {
            sizeReduction = Math.round((1 - processedFile.size / file.size) * 100);
          }
        } catch (error) {
          console.warn('Error al optimizar imagen:', error);
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
        optimized,
        sizeReduction
      };

      // Generar preview
      await this.createFilePreview(fileWithPreview);
      
      return fileWithPreview;
    });

    const processedFiles = await Promise.all(processPromises);
    this.selectedFiles.push(...processedFiles);
    
    // Limpiar mensaje de procesamiento
    if (this.uploadError === '⚡ Optimizando archivos grandes...') {
      this.uploadError = null;
    }
  }

  /**
   * Actualiza el tiempo estimado de subida
   */
  private updateEstimatedTime(): void {
    if (this.selectedFiles.length > 0) {
      this.estimatedTime = this.bunnyStorage.estimateUploadTime(
        this.selectedFiles.map(f => f.file)
      );
    } else {
      this.estimatedTime = '';
    }
  }

  /**
   * Genera un ID único más eficiente
   */
  private generateFileId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  /**
   * Crea vista previa optimizada
   */
  private createFilePreview(fileWithPreview: FileWithPreview): Promise<void> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        fileWithPreview.previewUrl = reader.result;
        resolve();
      };
      
      reader.onerror = () => resolve();
      
      // Para videos grandes, no generar preview para ahorrar memoria
      if (fileWithPreview.isVideo && fileWithPreview.file.size > 100 * 1024 * 1024) { // > 100MB
        resolve();
        return;
      }
      
      reader.readAsDataURL(fileWithPreview.file);
    });
  }

  /**
   * Subida TOTAL en paralelo - ¡TODOS los archivos a la vez!
   */
  onSubmit(): void {
    if (this.uploadForm.invalid || this.selectedFiles.length === 0) {
      return;
    }
        
    // Iniciar la subida masiva
    this.isUploading = true;
    this.globalUploadProgress = 0;
    this.allFilesUploaded = false;
    this.uploadError = null;
    
    // Marcar todos los archivos como "subiendo"
    this.selectedFiles.forEach(file => {
      file.uploadStatus = 'uploading';
      file.uploadProgress = 0;
      file.uploadError = undefined;
    });
    
    // Extraer archivos para subir
    const filesToUpload = this.selectedFiles.map(f => f.file);
    
    console.log(`🚀 Iniciando subida paralela de ${filesToUpload.length} archivos...`);
    
    // ¡SUBIR TODOS EN PARALELO TOTAL!
    this.bunnyStorage.uploadAllFilesInParallel(
      filesToUpload, 
      'wedding',
      (overallProgress, fileProgresses) => {
        // Actualizar progreso global
        this.globalUploadProgress = overallProgress;
        
        // Actualizar progreso individual
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
        console.log('✅ Subida paralela completada:', results);
        
        this.isUploading = false;
        
        // Actualizar estado final
        results.forEach((result, index) => {
          if (this.selectedFiles[index]) {
            this.selectedFiles[index].uploadStatus = result.success ? 'success' : 'error';
            this.selectedFiles[index].uploadError = result.error;
            this.selectedFiles[index].uploadProgress = result.success ? 100 : 0;
          }
        });
        
        // Verificar éxito total
        const successCount = this.selectedFiles.filter(f => f.uploadStatus === 'success').length;
        const totalCount = this.selectedFiles.length;
        
        this.allFilesUploaded = successCount === totalCount;
        
        if (this.allFilesUploaded) {
          console.log('🎉 ¡Todos los archivos subidos exitosamente!');
          setTimeout(() => this.resetForm(), 4000);
        } else {
          const failedCount = totalCount - successCount;
          this.uploadError = `⚠️ ${failedCount} de ${totalCount} archivos fallaron. Revisa los errores individuales.`;
        }
      },
      error: (error) => {
        console.error('❌ Error en subida masiva:', error);
        this.isUploading = false;
        this.uploadError = `Error general: ${error.message}`;
      }
    });
  }

  /**
   * Métodos de utilidad
   */
  private updateFilesFormControl(): void {
    const hasFiles = this.selectedFiles.length > 0;
    this.uploadForm.get('files')?.setValue(hasFiles ? this.selectedFiles : null);
  }

  removeFile(fileId: string): void {
    this.selectedFiles = this.selectedFiles.filter(f => f.id !== fileId);
    this.updateFilesFormControl();
    this.updateEstimatedTime();
    this.resetFileInput();
  }

  removeAllFiles(): void {
    this.selectedFiles = [];
    this.updateFilesFormControl();
    this.uploadError = null;
    this.estimatedTime = '';
    this.resetFileInput();
  }

  private resetFileInput(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  resetForm(): void {
    this.uploadForm.reset();
    this.removeAllFiles();
    this.allFilesUploaded = false;
    this.uploadError = null;
    this.isUploading = false;
    this.globalUploadProgress = 0;
  }

  getFileStatusIcon(file: FileWithPreview): string {
    switch (file.uploadStatus) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'uploading': return '⬆️';
      default: return '📎';
    }
  }

  getFileStatusClass(file: FileWithPreview): string {
    return `file-status-${file.uploadStatus}`;
  }

  getOptimizationInfo(file: FileWithPreview): string {
    if (!file.optimized || !file.sizeReduction) return '';
    
    const originalMB = (file.originalFile.size / 1024 / 1024).toFixed(1);
    const optimizedMB = (file.file.size / 1024 / 1024).toFixed(1);
    
    return `Optimizada: ${originalMB}MB → ${optimizedMB}MB (-${file.sizeReduction}%)`;
  }

  getTotalSize(): string {
    const totalBytes = this.selectedFiles.reduce((sum, f) => sum + f.file.size, 0);
    const totalMB = totalBytes / (1024 * 1024);
    
    if (totalMB < 1024) {
      return `${totalMB.toFixed(1)} MB`;
    } else {
      return `${(totalMB / 1024).toFixed(2)} GB`;
    }
  }

  getTotalSavings(): string {
    const originalBytes = this.selectedFiles.reduce((sum, f) => sum + f.originalFile.size, 0);
    const optimizedBytes = this.selectedFiles.reduce((sum, f) => sum + f.file.size, 0);
    
    if (originalBytes === optimizedBytes) return '';
    
    const savings = Math.round((1 - optimizedBytes / originalBytes) * 100);
    const savedMB = ((originalBytes - optimizedBytes) / 1024 / 1024).toFixed(1);
    
    return `Ahorro total: ${savedMB}MB (-${savings}%)`;
  }

  retryFailedUploads(): void {
    const failedFiles = this.selectedFiles.filter(f => f.uploadStatus === 'error');
    if (failedFiles.length === 0) return;

    // Resetear estado de archivos fallidos
    failedFiles.forEach(file => {
      file.uploadStatus = 'uploading';
      file.uploadProgress = 0;
      file.uploadError = undefined;
    });

    const filesToRetry = failedFiles.map(f => f.file);
    this.isUploading = true;

    this.bunnyStorage.uploadAllFilesInParallel(
      filesToRetry,
      'wedding'
    ).subscribe({
      next: () => {
        this.isUploading = false;
        this.allFilesUploaded = this.selectedFiles.every(f => f.uploadStatus === 'success');
      },
      error: (error) => {
        this.isUploading = false;
        this.uploadError = `Error al reintentar: ${error.message}`;
      }
    });
  }
}