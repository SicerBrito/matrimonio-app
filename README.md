# Aplicación para Evento de Matrimonio

Esta aplicación web permitirá a los invitados de tu evento de matrimonio subir fotos y videos mediante un código QR colocado en las mesas.

## Características

- Construida con Angular 18
- Subida de archivos directa a Bunny.net Storage 
- Soporte para imágenes (.jpg, .png) y videos (.mp4, .mov)
- Validación de archivos (tamaño máximo de 1 GB)
- Previsualización de archivos
- Guardado de metadatos de los archivos (localmente o en Firestore)
- Despliegue fácil con Firebase Hosting
- Generación de códigos QR para compartir

## Tecnologías Utilizadas

- Angular 18
- Bunny.net Storage API
- Firebase Hosting
- Firestore (opcional)
- QR Code Generator

## Estructura del Proyecto

```
matrimonio-app/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   └── file-upload/
│   │   ├── services/
│   │   ├── models/
│   │   └── ...
│   ├── environments/
│   ├── assets/
│   └── ...
├── scripts/
│   └── generate-qr.js
├── firebase.json
├── .firebaserc
└── ...
```

## Instrucciones de Uso

1. Configura el entorno con tus credenciales de Bunny.net y Firebase
2. Construye la aplicación usando `ng build --configuration production`
3. Despliega en Firebase con `firebase deploy`
4. Genera los códigos QR con `node scripts/generate-qr.js`
5. Imprime los códigos QR y colócalos en las mesas

Para instrucciones detalladas, consulta [DEPLOYMENT.md](./DEPLOYMENT.md).

## Personalización

Puedes personalizar fácilmente:
- Colores y estilos de la aplicación (archivos SCSS)
- Mensajes y textos (archivos HTML)
- Límites de tamaño y tipos de archivos permitidos

## Contribuciones

Este proyecto fue creado específicamente para eventos de matrimonio, pero puedes adaptarlo para cualquier tipo de evento donde se necesite recolectar archivos multimedia de los invitados.

## Licencia

MIT