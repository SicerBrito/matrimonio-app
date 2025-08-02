import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BunnyStorageService } from '../../services/bunny-storage.service';
// import { MetadataService } from '../../services/metadata.service';
import { FileMetadata } from '../../models/file-metadata.model';

interface FileWithPreview {
  file: File;
  previewUrl: string | ArrayBuffer | null;
  isVideo: boolean;
  uploadProgress: number;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadError?: string;
  id: string;
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
  
  // Constantes para validación
  readonly MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
  readonly MAX_FILES = 10; // Máximo 10 archivos por carga
  readonly ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 
    'video/mp4', 'video/quicktime'
  ];

  constructor(
    private fb: FormBuilder,
    private bunnyStorage: BunnyStorageService,
    // private metadataService: MetadataService
  ) {
    this.uploadForm = this.fb.group({
      guestName: ['', [Validators.required, Validators.minLength(2)]],
      files: [null, [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Inicialización adicional si es necesaria
  }

  /**
   * Maneja la selección de múltiples archivos
   */
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (input.files && input.files.length) {
      const newFiles = Array.from(input.files);
      
      // Verificar límite de archivos
      if (this.selectedFiles.length + newFiles.length > this.MAX_FILES) {
        this.uploadError = `Máximo ${this.MAX_FILES} archivos permitidos`;
        return;
      }
      
      // Procesar cada archivo nuevo
      newFiles.forEach(file => {
        // Validar tipo de archivo
        if (!this.ALLOWED_TYPES.includes(file.type)) {
          this.uploadError = `Archivo "${file.name}" no permitido. Solo se aceptan imágenes (.jpg, .png) y videos (.mp4, .mov)`;
          return;
        }
        
        // Validar tamaño del archivo
        if (file.size > this.MAX_FILE_SIZE) {
          this.uploadError = `Archivo "${file.name}" demasiado grande. Máximo 1 GB`;
          return;
        }
        
        // Crear objeto FileWithPreview
        const fileWithPreview: FileWithPreview = {
          file,
          previewUrl: null,
          isVideo: file.type.startsWith('video/'),
          uploadProgress: 0,
          uploadStatus: 'pending',
          id: this.generateFileId()
        };
        
        // Generar preview
        this.createFilePreview(fileWithPreview);
        
        // Agregar a la lista
        this.selectedFiles.push(fileWithPreview);
      });
      
      // Actualizar el FormControl
      this.updateFilesFormControl();
      
      // Limpiar errores si todo está bien
      if (this.selectedFiles.length > 0) {
        this.uploadError = null;
      }
    }
  }

  /**
   * Genera un ID único para cada archivo
   */
  private generateFileId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Crea una vista previa del archivo
   */
  private createFilePreview(fileWithPreview: FileWithPreview): void {
    const reader = new FileReader();
    
    reader.onload = () => {
      fileWithPreview.previewUrl = reader.result;
    };
    
    reader.readAsDataURL(fileWithPreview.file);
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
    
    // Resetear el input file para permitir seleccionar el mismo archivo nuevamente
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /**
   * Remueve todos los archivos
   */
  removeAllFiles(): void {
    this.selectedFiles = [];
    this.updateFilesFormControl();
    this.uploadError = null;
    
    // Resetear el input file
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /**
   * Obtiene el progreso global de subida
   */
  private calculateGlobalProgress(): void {
    if (this.selectedFiles.length === 0) {
      this.globalUploadProgress = 0;
      return;
    }
    
    const totalProgress = this.selectedFiles.reduce((sum, file) => sum + file.uploadProgress, 0);
    this.globalUploadProgress = Math.round(totalProgress / this.selectedFiles.length);
  }

  /**
   * Maneja el envío del formulario
   */
  onSubmit(): void {
    if (this.uploadForm.invalid || this.selectedFiles.length === 0) {
      return;
    }
    
    const guestName = this.uploadForm.get('guestName')?.value;
    
    // Iniciar la subida
    this.isUploading = true;
    this.globalUploadProgress = 0;
    this.allFilesUploaded = false;
    this.uploadError = null;
    
    // Resetear el estado de todos los archivos
    this.selectedFiles.forEach(file => {
      file.uploadStatus = 'pending';
      file.uploadProgress = 0;
      file.uploadError = undefined;
    });
    
    // Subir archivos secuencialmente (puedes cambiar a paralelo si prefieres)
    this.uploadFilesSequentially(guestName, 0);
  }

  /**
   * Sube los archivos de forma secuencial
   */
  private uploadFilesSequentially(guestName: string, index: number): void {
    if (index >= this.selectedFiles.length) {
      // Todos los archivos han sido procesados
      this.isUploading = false;
      this.allFilesUploaded = this.selectedFiles.every(f => f.uploadStatus === 'success');
      
      if (this.allFilesUploaded) {
        // Resetear el formulario después de un breve retraso
        setTimeout(() => {
          this.resetForm();
        }, 3000);
      }
      return;
    }
    
    const currentFile = this.selectedFiles[index];
    currentFile.uploadStatus = 'uploading';
    
    // Subir al Storage Zone
    this.bunnyStorage.uploadFile(currentFile.file, 'matrimonio-fotos')
      .subscribe({
        next: (result) => {
          // Actualizar el progreso del archivo actual
          currentFile.uploadProgress = result.progress;
          this.calculateGlobalProgress();
          
          // Si la subida se completó y tenemos la URL
          if (result.progress === 100 && result.url) {
            currentFile.uploadStatus = 'success';
            
            // Guardar los metadatos
            const metadata: FileMetadata = {
              guestName,
              fileName: currentFile.file.name,
              fileType: currentFile.file.type,
              fileSize: currentFile.file.size,
              publicUrl: result.url,
              timestamp: new Date()
            };
            
            // this.metadataService.saveMetadata(metadata).subscribe({
            //   next: (success) => {
            //     if (!success) {
            //       currentFile.uploadError = 'Error al guardar metadatos';
            //       currentFile.uploadStatus = 'error';
            //     }
            //     // Continuar con el siguiente archivo
            //     this.uploadFilesSequentially(guestName, index + 1);
            //   },
            //   error: (err) => {
            //     currentFile.uploadError = 'Error al guardar metadatos';
            //     currentFile.uploadStatus = 'error';
            //     this.uploadFilesSequentially(guestName, index + 1);
            //   }
            // });
            
            // Mientras tanto, continuar con el siguiente archivo
            this.uploadFilesSequentially(guestName, index + 1);
          }
        },
        error: (error: HttpErrorResponse) => {
          currentFile.uploadError = error.message || 'Error al subir archivo';
          currentFile.uploadStatus = 'error';
          
          // Continuar con el siguiente archivo
          this.uploadFilesSequentially(guestName, index + 1);
        }
      });
  }

  /**
   * Sube los archivos en paralelo (alternativa)
   */
  private uploadFilesInParallel(guestName: string): void {
    let completedUploads = 0;
    
    this.selectedFiles.forEach((fileWithPreview) => {
      fileWithPreview.uploadStatus = 'uploading';
      
      this.bunnyStorage.uploadFile(fileWithPreview.file, 'matrimonio-fotos')
        .subscribe({
          next: (result) => {
            fileWithPreview.uploadProgress = result.progress;
            this.calculateGlobalProgress();
            
            if (result.progress === 100 && result.url) {
              fileWithPreview.uploadStatus = 'success';
              completedUploads++;
              
              // Verificar si todos los archivos han terminado
              if (completedUploads === this.selectedFiles.length) {
                this.isUploading = false;
                this.allFilesUploaded = this.selectedFiles.every(f => f.uploadStatus === 'success');
                
                if (this.allFilesUploaded) {
                  setTimeout(() => {
                    this.resetForm();
                  }, 3000);
                }
              }
            }
          },
          error: (error: HttpErrorResponse) => {
            fileWithPreview.uploadError = error.message || 'Error al subir archivo';
            fileWithPreview.uploadStatus = 'error';
            completedUploads++;
            
            if (completedUploads === this.selectedFiles.length) {
              this.isUploading = false;
              this.allFilesUploaded = this.selectedFiles.every(f => f.uploadStatus === 'success');
            }
          }
        });
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
}