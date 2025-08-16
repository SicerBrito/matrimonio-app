import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEventType } from '@angular/common/http';
import { Observable, throwError, forkJoin, of, from } from 'rxjs';
import { map, catchError, mergeMap, concatMap, toArray } from 'rxjs/operators';
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
    
    // Configuración para subidas paralelas
    private readonly MAX_CONCURRENT_UPLOADS = 6; // Máximo 3 archivos simultáneos
    private readonly CHUNK_SIZE = 10 * 1024 * 1024; // De 5MB a 10MB chunks

    constructor(private http: HttpClient) {
        this.baseUrl = environment.bunnyStorage.endpoint;
        this.accessKey = environment.bunnyStorage.apiKey;
        this.storageZone = environment.bunnyStorage.storageZoneName;
    }

    /**
     * Sube múltiples archivos en paralelo con control de concurrencia
     */
    uploadMultipleFiles(
        files: File[], 
        path: string = '', 
        progressCallback?: (overallProgress: number, fileProgresses: BatchUploadResult[]) => void
    ): Observable<BatchUploadResult[]> {
        
        if (files.length === 0) {
            return of([]);
        }
    
        // Separar archivos por tamaño para optimizar la cola
        const smallFiles = files.filter(f => f.size < 10 * 1024 * 1024); // < 10MB
        const largeFiles = files.filter(f => f.size >= 10 * 1024 * 1024); // >= 10MB
    
        // Inicializar el estado de progreso para cada archivo
        const fileProgresses: BatchUploadResult[] = files.map(file => ({
            fileName: file.name,
            success: false,
            progress: 0
        }));
    
        // Crear observables para cada archivo
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
    
        // CAMBIO: Usar mergeMap con concurrencia en lugar de la lógica compleja
        return from(uploadObservables).pipe(
            mergeMap(obs => obs, this.MAX_CONCURRENT_UPLOADS), // Esto permite 6 paralelos
            toArray(), // Recoger todos los resultados
            map(() => fileProgresses)
        );
    }

    /**
     * Ejecuta observables con límite de concurrencia
     */
    private executeWithConcurrencyLimit<T>(observables: Observable<T>[]): Observable<T[]> {
        return of(observables).pipe(
            mergeMap(obs => 
                forkJoin(
                    obs.map((observable, index) => 
                        of(index).pipe(
                            concatMap(() => observable)
                        )
                    ).slice(0, this.MAX_CONCURRENT_UPLOADS)
                ).pipe(
                    mergeMap(firstBatch => {
                        const remaining = obs.slice(this.MAX_CONCURRENT_UPLOADS);
                        if (remaining.length === 0) {
                            return of(firstBatch);
                        }
                        
                        return this.executeWithConcurrencyLimit(remaining).pipe(
                            map(remainingResults => [...firstBatch, ...remainingResults])
                        );
                    })
                )
            )
        );
    }

    /**
     * Sube un archivo individual con optimizaciones
     */
    uploadFileToStorage(file: File, fileName: string, path: string = ''): Observable<UploadResult> {
        // Crear una ruta segura
        path = path.replace(/^\/+/, '');
    
        // Generar un nombre de archivo único
        const timestamp = new Date().getTime();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${timestamp}-${randomStr}-${safeName}`;
    
        // Construir la URL completa
        const fileUploadUrl = `${this.baseUrl}/${this.storageZone}/${path}${path ? '/' : ''}${uniqueFileName}`;
    
        return this.uploadWithOptimizedHeaders(file, fileUploadUrl, uniqueFileName, path);
    }

    /**
     * Upload unificado con headers optimizados para todos los archivos
     */
    uploadWithOptimizedHeaders(file: File, uploadUrl: string, fileName: string, path: string): Observable<UploadResult> {
        const headers = new HttpHeaders({
            'AccessKey': this.accessKey,
            'Content-Type': file.type || 'application/octet-stream'
        });
    
        return this.http.put(uploadUrl, file, {
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
                        const publicUrl = `https://${this.storageZone}.b-cdn.net/${path}${path ? '/' : ''}${fileName}`;
                        return { progress: 100, url: publicUrl, fileName, success: true };
    
                    default:
                        return { progress: 0, fileName };
                }
            }),
            catchError(error => {
                console.error('Error al subir archivo:', error);
                return of({ 
                    progress: 0, 
                    fileName, 
                    success: false, 
                    error: error.message || 'Error al subir archivo' 
                });
            })
        );
    }

    /**
     * Comprime imagen antes de subir (opcional)
     */
    compressImage(file: File, maxWidth: number = 1920, quality: number = 0.92): Promise<File> {
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
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                
                ctx?.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    } else {
                        resolve(file);
                    }
                }, file.type, quality);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Valida archivos antes de subir
     */
    validateFiles(files: File[]): { valid: File[], invalid: { file: File, reason: string }[] } {
        const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
        const ALLOWED_TYPES = [
            'image/jpeg', 'image/png', 'image/webp',
            'video/mp4', 'video/quicktime', 'video/webm'
        ];
    
        const valid: File[] = [];
        const invalid: { file: File, reason: string }[] = [];
    
        files.forEach(file => {
            if (!ALLOWED_TYPES.includes(file.type)) {
                invalid.push({ file, reason: 'Tipo de archivo no permitido' });
            } else if (file.size > MAX_FILE_SIZE) {
                invalid.push({ file, reason: 'Archivo demasiado grande (máx. 5GB)' });
            } else {
                valid.push(file);
            }
        });
    
        return { valid, invalid };
    }
}