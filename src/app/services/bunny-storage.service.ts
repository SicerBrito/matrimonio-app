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
    
    // Configuración optimizada para archivos grandes
    private readonly MAX_CONCURRENT_UPLOADS = 3; // Reducido para archivos grandes
    private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB por chunk
    private readonly LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
    private readonly MAX_RETRIES = 3;

    constructor(private http: HttpClient) {
        this.baseUrl = environment.bunnyStorage.endpoint;
        this.accessKey = environment.bunnyStorage.apiKey;
        this.storageZone = environment.bunnyStorage.storageZoneName;
    }

    /**
     * Sube múltiples archivos con manejo inteligente por tamaño
     */
    uploadMultipleFiles(
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

        // Crear observables para cada archivo con estrategia apropiada
        const uploadObservables = files.map((file, index) => {
            const useChunkedUpload = file.size > this.LARGE_FILE_THRESHOLD;
            
            return (useChunkedUpload ? 
                this.uploadLargeFileWithChunks(file, file.name, path) : 
                this.uploadFileToStorage(file, file.name, path)
            ).pipe(
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
        });

        // Usar concurrencia reducida para archivos grandes
        const concurrencyLimit = files.some(f => f.size > this.LARGE_FILE_THRESHOLD) ? 2 : this.MAX_CONCURRENT_UPLOADS;
        
        return from(uploadObservables).pipe(
            mergeMap(obs => obs, concurrencyLimit),
            toArray(),
            map(() => fileProgresses)
        );
    }

    /**
     * Subida por chunks para archivos grandes
     */
    private uploadLargeFileWithChunks(file: File, fileName: string, path: string = ''): Observable<UploadResult> {
        // Crear una ruta segura
        path = path.replace(/^\/+/, '');
        
        // Generar un nombre de archivo único
        const timestamp = new Date().getTime();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${timestamp}-${randomStr}-${safeName}`;
        
        const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
        let uploadedBytes = 0;

        return new Observable<UploadResult>(subscriber => {
            this.uploadChunksSequentially(file, uniqueFileName, path, 0, totalChunks, (progress) => {
                subscriber.next({
                    progress,
                    fileName: uniqueFileName
                });
            }).then(finalUrl => {
                subscriber.next({
                    progress: 100,
                    url: finalUrl,
                    fileName: uniqueFileName,
                    success: true
                });
                subscriber.complete();
            }).catch(error => {
                subscriber.next({
                    progress: 0,
                    fileName: uniqueFileName,
                    success: false,
                    error: error.message
                });
                subscriber.complete();
            });
        });
    }

    /**
     * Sube chunks de forma secuencial con reintentos
     */
    private async uploadChunksSequentially(
        file: File, 
        fileName: string, 
        path: string, 
        currentChunk: number, 
        totalChunks: number,
        progressCallback: (progress: number) => void
    ): Promise<string> {
        
        for (let chunkIndex = currentChunk; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            let retries = 0;
            let chunkUploaded = false;
            
            while (!chunkUploaded && retries < this.MAX_RETRIES) {
                try {
                    await this.uploadSingleChunk(chunk, fileName, path, chunkIndex, totalChunks);
                    chunkUploaded = true;
                    
                    // Actualizar progreso
                    const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                    progressCallback(progress);
                    
                } catch (error) {
                    retries++;
                    console.warn(`Chunk ${chunkIndex} falló, reintento ${retries}:`, error);
                    
                    if (retries >= this.MAX_RETRIES) {
                        throw new Error(`Falló chunk ${chunkIndex} después de ${this.MAX_RETRIES} intentos`);
                    }
                    
                    // Esperar antes del siguiente intento (backoff exponencial)
                    await this.delay(Math.pow(2, retries) * 1000);
                }
            }
        }
        
        // Retornar URL final
        return `https://${this.storageZone}.b-cdn.net/${path}${path ? '/' : ''}${fileName}`;
    }

    /**
     * Sube un chunk individual
     */
    private uploadSingleChunk(
        chunk: Blob, 
        fileName: string, 
        path: string, 
        chunkIndex: number, 
        totalChunks: number
    ): Promise<void> {
        const fileUploadUrl = `${this.baseUrl}/${this.storageZone}/${path}${path ? '/' : ''}${fileName}`;
        
        const headers = new HttpHeaders({
            'AccessKey': this.accessKey,
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${chunkIndex * this.CHUNK_SIZE}-${(chunkIndex * this.CHUNK_SIZE) + chunk.size - 1}/*`
        });

        return this.http.put(fileUploadUrl, chunk, {
            headers,
            observe: 'response'
        }).pipe(
            map(response => {
                if (response.status !== 200 && response.status !== 201) {
                    throw new Error(`HTTP ${response.status}`);
                }
            }),
            catchError(error => {
                throw new Error(`Error en chunk ${chunkIndex}: ${error.message}`);
            })
        ).toPromise();
    }

    /**
     * Sube un archivo individual (para archivos pequeños)
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
     * Upload con headers optimizados para archivos pequeños
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
     * Utility: delay para reintentos
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Comprime imagen antes de subir
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