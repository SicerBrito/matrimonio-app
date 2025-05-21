export interface FileMetadata {
    id?: string;            // ID único (puede ser generado por Firestore)
    guestName: string;      // Nombre del invitado
    fileName: string;       // Nombre del archivo original
    fileType: string;       // Tipo MIME del archivo
    fileSize: number;       // Tamaño en bytes
    publicUrl: string;      // URL pública en Bunny.net
    timestamp: Date;        // Fecha y hora de subida
}