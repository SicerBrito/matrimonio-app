import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEventType } from '@angular/common/http';
import { Observable, throwError, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface UploadResult {
  progress: number;
  url?: string;
  fileName?: string;
  success?: boolean;
  error?: string;
}

export interface BatchUploadResult {
  fileName: string;
  success: boolean;
  url?: string;
  error?: string;
  progress: number;
}

@Injectable({
    providedIn: 'root'
})
export class BunnyStorageService {
    private readonly baseUrl: string;
    private readonly accessKey: string;
    private readonly storageZone: string;
    
    // Configuración optimizada para Bunny Storage
    private readonly MAX_CONCURRENT_UPLOADS = 50; // Límite máximo de Bunny Storage
    private readonly MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB por archivo (recomendado para web)

    constructor(private http: HttpClient) {
        this.baseUrl = environment.bunnyStorage.endpoint;
        this.accessKey = environment.bunnyStorage.apiKey;
        this.storageZone = environment.bunnyStorage.storageZoneName;
    }

    /**
     * Sube TODOS los archivos en paralelo completamente
     * Aprovecha el límite de 50 conexiones simultáneas de Bunny Storage
     */
    uploadAllFilesInParallel(
        files: File[], 
        path: string = '', 
        progressCallback?: (overallProgress: number, fileProgresses: BatchUploadResult[]) => void
    ): Observable<BatchUploadResult[]> {
        
        if (files.length === 0) {
            return of([]);
        }

        // Inicializar el estado de progreso para cada archivo
        const fileProgresses: BatchUploadResult[] = files.map(file => ({
            fileName: file.name,
            success: false,
            progress: 0
        }));

        // Crear observables para TODOS los archivos (sin límite de concurrencia)
        const uploadObservables = files.map((file, index) => 
            this.uploadFileToStorage(file, file.name, path).pipe(
                map(result => {
                    // Actualizar el progreso del archivo específico
                    fileProgresses[index] = {
                        fileName: file.name,
                        success: result.progress === 100 && !!result.url,
                        url: result.url,
                        progress: result.progress,
                        error: result.error
                    };

                    // Calcular progreso general
                    const overallProgress = Math.round(
                        fileProgresses.reduce((sum, fp) => sum + fp.progress, 0) / files.length
                    );

                    // Llamar callback si existe
                    if (progressCallback) {
                        progressCallback(overallProgress, [...fileProgresses]);
                    }

                    return fileProgresses[index];
                }),
                catchError(error => {
                    fileProgresses[index] = {
                        fileName: file.name,
                        success: false,
                        progress: 0,
                        error: error.message || 'Error desconocido'
                    };

                    if (progressCallback) {
                        const overallProgress = Math.round(
                            fileProgresses.reduce((sum, fp) => sum + fp.progress, 0) / files.length
                        );
                        progressCallback(overallProgress, [...fileProgresses]);
                    }

                    return of(fileProgresses[index]);
                })
            )
        );

        // Ejecutar TODAS las subidas en paralelo usando forkJoin
        return forkJoin(uploadObservables).pipe(
            map(() => fileProgresses)
        );
    }

    /**
     * Sube un archivo individual optimizado para Bunny Storage
     */
    uploadFileToStorage(file: File, fileName: string, path: string = ''): Observable<UploadResult> {
        // Crear una ruta segura
        path = path.replace(/^\/+/, '');

        // Generar un nombre de archivo único con timestamp más corto
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 6); // Más corto
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${timestamp}_${randomStr}_${safeName}`;

        // Construir la URL completa
        const fileUploadUrl = `${this.baseUrl}/${this.storageZone}/${path}${path ? '/' : ''}${uniqueFileName}`;

        // Headers optimizados para Bunny Storage
        const headers = new HttpHeaders({
            'AccessKey': this.accessKey,
            'Content-Type': file.type || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000', // Cache por 1 año
            'Accept': '*/*'
        });

        return this.http.put(fileUploadUrl, file, {
            headers,
            reportProgress: true,
            observe: 'events'
        }).pipe(
            map(event => {
                switch (event.type) {
                    case HttpEventType.UploadProgress:
                        const progress = Math.round(100 * event.loaded / (event.total || file.size));
                        return { progress, fileName };

                    case HttpEventType.Response:
                        const publicUrl = `https://${this.storageZone}.b-cdn.net/${path}${path ? '/' : ''}${uniqueFileName}`;
                        return { progress: 100, url: publicUrl, fileName, success: true };

                    default:
                        return { progress: 0, fileName };
                }
            }),
            catchError(error => {
                console.error('Error al subir archivo a Bunny:', error);
                return of({ 
                    progress: 0, 
                    fileName, 
                    success: false, 
                    error: this.getErrorMessage(error)
                });
            })
        );
    }

    /**
     * Comprime imagen con diferentes niveles de calidad
     * CALIDAD ALTA: 0.95 (pérdida mínima)
     * CALIDAD MEDIA: 0.85 (buen balance)
     * CALIDAD BÁSICA: 0.75 (más compresión)
     */
    compressImage(
        file: File, 
        maxWidth: number = 2560, // Mantener alta resolución
        quality: number = 0.92,   // Calidad muy alta por defecto
        format: 'webp' | 'jpeg' | 'original' = 'original'
    ): Promise<File> {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calcular nuevas dimensiones manteniendo la proporción
                let { width, height } = img;
                
                // Solo comprimir si es mayor al máximo
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                
                // Configuración de calidad para el canvas
                if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);
                }
                
                // Determinar formato de salida
                let outputType = file.type;
                if (format === 'webp') outputType = 'image/webp';
                else if (format === 'jpeg') outputType = 'image/jpeg';
                
                canvas.toBlob((blob) => {
                    if (blob && blob.size < file.size) {
                        // Solo usar la versión comprimida si es menor
                        const compressedFile = new File([blob], file.name, {
                            type: outputType,
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    } else {
                        // Mantener original si la compresión no ayuda
                        resolve(file);
                    }
                }, outputType, quality);
            };

            img.onerror = () => resolve(file); // Fallback al archivo original
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Valida archivos con límites optimizados para Bunny Storage
     */
    validateFiles(files: File[]): { valid: File[], invalid: { file: File, reason: string }[] } {
        const ALLOWED_TYPES = [
            // Imágenes
            'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
            // Videos
            'video/mp4', 'video/quicktime', 'video/webm', 'video/avi', 'video/mov',
            // Audio (bonus)
            'audio/mp3', 'audio/wav', 'audio/m4a'
        ];

        const valid: File[] = [];
        const invalid: { file: File, reason: string }[] = [];

        files.forEach(file => {
            if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
                invalid.push({ file, reason: 'Formato no soportado' });
            } else if (file.size > this.MAX_FILE_SIZE) {
                const maxSizeGB = this.MAX_FILE_SIZE / (1024 * 1024 * 1024);
                invalid.push({ file, reason: `Archivo muy grande (máx. ${maxSizeGB}GB)` });
            } else if (file.size === 0) {
                invalid.push({ file, reason: 'Archivo vacío' });
            } else {
                valid.push(file);
            }
        });

        return { valid, invalid };
    }

    /**
     * Obtiene un mensaje de error más amigable
     */
    private getErrorMessage(error: any): string {
        if (error.status === 413) {
            return 'Archivo demasiado grande para subir';
        } else if (error.status === 403) {
            return 'No tienes permisos para subir archivos';
        } else if (error.status === 429) {
            return 'Demasiadas subidas simultáneas, reintenta en unos segundos';
        } else if (error.status === 0) {
            return 'Error de conexión - verifica tu internet';
        } else {
            return error.message || `Error ${error.status}: No se pudo subir el archivo`;
        }
    }

    /**
     * Estima el tiempo de subida basado en el tamaño total
     */
    estimateUploadTime(files: File[], connectionSpeedMbps: number = 10): string {
        const totalSizeBytes = files.reduce((sum, file) => sum + file.size, 0);
        const totalSizeMB = totalSizeBytes / (1024 * 1024);
        const estimatedSeconds = (totalSizeMB * 8) / connectionSpeedMbps; // Convertir a bits y dividir por velocidad
        
        if (estimatedSeconds < 60) {
            return `~${Math.ceil(estimatedSeconds)} segundos`;
        } else if (estimatedSeconds < 3600) {
            return `~${Math.ceil(estimatedSeconds / 60)} minutos`;
        } else {
            return `~${Math.ceil(estimatedSeconds / 3600)} horas`;
        }
    }

    /**
     * Optimización automática de archivos antes de subir
     */
    async optimizeFilesForUpload(files: File[]): Promise<File[]> {
        const optimizedFiles = await Promise.all(
            files.map(async (file) => {
                // Solo optimizar imágenes grandes
                if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) { // > 2MB
                    try {
                        return await this.compressImage(file, 2560, 0.92);
                    } catch (error) {
                        console.warn(`No se pudo optimizar ${file.name}:`, error);
                        return file;
                    }
                }
                return file;
            })
        );
        
        return optimizedFiles;
    }
}