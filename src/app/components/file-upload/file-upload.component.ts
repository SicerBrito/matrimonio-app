import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BunnyStorageService } from '../../services/bunny-storage.service';
// import { MetadataService } from '../../services/metadata.service';
import { FileMetadata } from '../../models/file-metadata.model';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss']
})
export class FileUploadComponent implements OnInit {
  uploadForm: FormGroup;
  selectedFile: File | null = null;
  previewUrl: string | ArrayBuffer | null = null;
  isUploading = false;
  uploadProgress = 0;
  uploadSuccess = false;
  uploadError: string | null = null;
  isVideo = false;
  
  // Constantes para validación
  readonly MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
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
      file: [null, [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Inicialización adicional si es necesaria
  }

  /**
   * Maneja la selección de archivo
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (input.files && input.files.length) {
      const file = input.files[0];
      this.selectedFile = file;
      
      // Validar tipo de archivo
      if (!this.ALLOWED_TYPES.includes(file.type)) {
        this.uploadError = 'Tipo de archivo no permitido. Por favor, sube una imagen (.jpg, .png) o un video (.mp4, .mov)';
        this.resetFileInput();
        return;
      }
      
      // Validar tamaño del archivo
      if (file.size > this.MAX_FILE_SIZE) {
        this.uploadError = 'Archivo demasiado grande. El tamaño máximo permitido es 1 GB';
        this.resetFileInput();
        return;
      }
      
      // Determinar si es un video
      this.isVideo = file.type.startsWith('video/');
      
      // Generar preview
      this.createFilePreview(file);
      
      // Limpiar errores previos
      this.uploadError = null;
    }
  }

  /**
   * Crea una vista previa del archivo
   */
  private createFilePreview(file: File): void {
    const reader = new FileReader();
    
    reader.onload = () => {
      this.previewUrl = reader.result;
    };
    
    reader.readAsDataURL(file);
  }

  /**
   * Resetea el input de archivo
   */
  private resetFileInput(): void {
    this.selectedFile = null;
    this.previewUrl = null;
    this.uploadForm.get('file')?.setValue(null);
    
    // Resetear el elemento input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /**
   * Maneja el envío del formulario
   */
  onSubmit(): void {
    if (this.uploadForm.invalid || !this.selectedFile) {
      return;
    }
    
    const guestName = this.uploadForm.get('guestName')?.value;
    
    // Iniciar la subida
    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadSuccess = false;
    this.uploadError = null;
    
    // Subir al Storage Zone
    this.bunnyStorage.uploadFile(this.selectedFile, 'matrimonio-fotos')
      .subscribe({
        next: (result) => {
          // Actualizar el progreso
          this.uploadProgress = result.progress;
          
          // Si la subida se completó y tenemos la URL
          if (result.progress === 100 && result.url) {
            // Guardar los metadatos
            const metadata: FileMetadata = {
              guestName,
              fileName: this.selectedFile!.name,
              fileType: this.selectedFile!.type,
              fileSize: this.selectedFile!.size,
              publicUrl: result.url,
              timestamp: new Date()
            };
            
            // this.metadataService.saveMetadata(metadata).subscribe({
            //   next: (success) => {
            //     if (success) {
            //       this.uploadSuccess = true;
            //       this.isUploading = false;
                  
            //       // Resetear el formulario después de un breve retraso
            //       setTimeout(() => {
            //         this.resetForm();
            //       }, 3000);
            //     } else {
            //       this.uploadError = 'Error al guardar los metadatos del archivo';
            //       this.isUploading = false;
            //     }
            //   },
            //   error: (err) => {
            //     this.uploadError = 'Error al guardar los metadatos del archivo';
            //     this.isUploading = false;
            //   }
            // });
          }
        },
        error: (error: HttpErrorResponse) => {
          this.uploadError = 'Error al subir el archivo: ' + (error.message || 'Inténtalo de nuevo');
          this.isUploading = false;
        }
      });
  }

  /**
   * Resetea el formulario completo
   */
  resetForm(): void {
    this.uploadForm.reset();
    this.resetFileInput();
    this.previewUrl = null;
    this.uploadSuccess = false;
    this.uploadError = null;
    this.isUploading = false;
    this.uploadProgress = 0;
  }
}