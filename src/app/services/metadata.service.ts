// import { Injectable, Optional } from '@angular/core';
// import { FileMetadata } from '../models/file-metadata.model';
// import { environment } from '../../environments/environment';
// import { Observable, from, of } from 'rxjs';
// import { map } from 'rxjs/operators';

// // Importaciones condicionales para Firestore
// import { AngularFirestore } from '@angular/fire/compat/firestore';

// @Injectable({
//     providedIn: 'root'
// })
// export class MetadataService {
//     private readonly useLocalStorage: boolean;
//     private readonly localStorageKey = 'matrimonio-app-uploads';

//     constructor(@Optional() private firestore: AngularFirestore) {
//         this.useLocalStorage = environment.useLocalStorage;
        
//         // Validación adicional para asegurarnos de que Firestore esté disponible cuando se necesite
//         if (!this.useLocalStorage && !this.firestore) {
//             console.error('Se requiere Firestore, pero no está disponible. Usando localStorage como respaldo.');
//             this.useLocalStorage = true;
//         }
//     }

//     /**
//      * Guarda los metadatos de un archivo
//      * @param metadata Metadatos del archivo
//      * @returns Observable que resuelve a true si el guardado fue exitoso
//      */
//     saveMetadata(metadata: FileMetadata): Observable<boolean> {
//         if (this.useLocalStorage) {
//             return this.saveToLocalStorage(metadata);
//         } else {
//             return this.saveToFirestore(metadata);
//         }
//     }

//     /**
//      * Obtiene todos los metadatos guardados
//      * @returns Observable con un array de metadatos
//      */
//     getAllMetadata(): Observable<FileMetadata[]> {
//         if (this.useLocalStorage) {
//             return this.getFromLocalStorage();
//         } else {
//             return this.getFromFirestore();
//         }
//     }

//     // Métodos privados para almacenamiento local

//     private saveToLocalStorage(metadata: FileMetadata): Observable<boolean> {
//         try {
//             // Obtener los datos actuales
//             const currentData: FileMetadata[] = JSON.parse(
//                 localStorage.getItem(this.localStorageKey) || '[]'
//             );

//             // Generar un ID único si no tiene uno
//             if (!metadata.id) {
//                 metadata.id = this.generateUniqueId();
//             }

//             // Añadir el nuevo registro
//             currentData.push(metadata);

//             // Guardar de vuelta en localStorage
//             localStorage.setItem(this.localStorageKey, JSON.stringify(currentData));

//             return of(true);
//         } catch (error) {
//             console.error('Error al guardar metadatos en localStorage:', error);
//             return of(false);
//         }
//     }

//     private getFromLocalStorage(): Observable<FileMetadata[]> {
//         try {
//             const data: FileMetadata[] = JSON.parse(
//                 localStorage.getItem(this.localStorageKey) || '[]'
//             );

//             // Convertir los timestamps de string a Date
//             return of(data.map(item => ({
//                 ...item,
//                 timestamp: item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp)
//             })));
//         } catch (error) {
//             console.error('Error al recuperar metadatos de localStorage:', error);
//             return of([]);
//         }
//     }

//     // Métodos privados para Firestore

//     private saveToFirestore(metadata: FileMetadata): Observable<boolean> {
//         if (!this.firestore) {
//             console.error('Firestore no está disponible.');
//             return of(false);
//         }
        
//         const collection = this.firestore.collection<FileMetadata>('uploads');
//         return from(collection.add({
//             ...metadata,
//             // Asegurarse de que timestamp sea un objeto Firestore Timestamp
//             timestamp: metadata.timestamp
//         })).pipe(
//             map(docRef => {
//                 console.log('Documento guardado con ID:', docRef.id);
//                 return true;
//             })
//         );
//     }

//     private getFromFirestore(): Observable<FileMetadata[]> {
//         if (!this.firestore) {
//             console.error('Firestore no está disponible.');
//             return of([]);
//         }
        
//         return this.firestore.collection<FileMetadata>('uploads',
//             ref => ref.orderBy('timestamp', 'desc')
//         ).valueChanges({ idField: 'id' });
//     }

//     // Utilidad para generar IDs únicos
//     private generateUniqueId(): string {
//         return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
//     }
// }