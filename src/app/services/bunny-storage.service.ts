import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEventType } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class BunnyStorageService {
    private readonly baseUrl: string;
    private readonly accessKey: string;
    private readonly storageZone: string;

    constructor(private http: HttpClient) {
        this.baseUrl = environment.bunnyStorage.endpoint;
        this.accessKey = environment.bunnyStorage.apiKey;
        this.storageZone = environment.bunnyStorage.storageZoneName;
    }

    /**
     * Sube un archivo a Bunny.net Storage Zone
     * @param file El archivo a subir
     * @param fileName Nombre del archivo
     * @param path Ruta dentro del storage zone (opcional)
     * @returns Observable con el progreso y la URL final
     */
    uploadFileToStorage(file: File, fileName: string, path: string = ''): Observable<{ progress: number, url?: string }> {
        // Crear una ruta segura: eliminar '/' al principio y normalizar el nombre del archivo
        path = path.replace(/^\/+/, '');

        // Generar un nombre de archivo único para evitar colisiones
        const timestamp = new Date().getTime();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${timestamp}-${randomStr}-${safeName}`;

        // Construir la URL completa para la subida
        const fileUploadUrl = `${this.baseUrl}/${this.storageZone}/${path}${path ? '/' : ''}${uniqueFileName}`;

        // Configurar los headers según la documentación de Bunny.net
        const headers = new HttpHeaders({
            'AccessKey': this.accessKey,
            'Content-Type': file.type
        });

        return this.http.put(fileUploadUrl, file, {
            headers,
            reportProgress: true,
            observe: 'events'
        }).pipe(
            map(event => {
                switch (event.type) {
                    case HttpEventType.UploadProgress:
                        // Calcular el progreso
                        const progress = Math.round(100 * event.loaded / (event.total || file.size));
                        return { progress };

                    case HttpEventType.Response:
                        // La subida se completó correctamente
                        // Construir la URL pública del archivo
                        const publicUrl = `https://${this.storageZone}.b-cdn.net/${path}${path ? '/' : ''}${uniqueFileName}`;
                        return { progress: 100, url: publicUrl };

                    default:
                        return { progress: 0 };
                }
            }),
            catchError(error => {
                console.error('Error al subir el archivo a Bunny.net:', error);
                return throwError(() => new Error(`Error al subir el archivo: ${error.message}`));
            })
        );
    }
}