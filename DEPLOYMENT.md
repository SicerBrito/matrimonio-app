# Instrucciones de Despliegue - Aplicación de Matrimonio

Este documento explica cómo desplegar la aplicación web de matrimonio en Firebase Hosting y generar los códigos QR para las mesas.

## Requisitos Previos

1. Node.js y npm instalados
2. Cuenta en Bunny.net y una Storage Zone creada
3. Cuenta en Firebase

## Paso 1: Configurar el entorno

1. **Configurar Bunny.net Storage Zone:**

   - Inicia sesión en tu cuenta de Bunny.net
   - Ve a la sección "Storage" y crea una nueva Storage Zone o usa una existente
   - Obtén los siguientes datos:
     - Nombre de la Storage Zone
     - Access Key (clave de acceso)
   - Actualiza el archivo `src/environments/environment.ts` y `environment.prod.ts` con estos datos:

   ```typescript
   bunnyStorage: {
     storageZoneName: 'TU_STORAGE_ZONE',  // Reemplaza con tu Storage Zone
     accessKey: 'TU_ACCESS_KEY',          // Reemplaza con tu Access Key
     endpoint: 'https://storage.bunnycdn.com',
     region: ''                           // Deja vacío o usa 'de', 'uk', etc.
   }
   ```

2. **Configurar Firebase:**

   - Instala Firebase CLI: `npm install -g firebase-tools`
   - Inicia sesión en Firebase: `firebase login`
   - Crea un nuevo proyecto en Firebase o usa uno existente
   - Configura Firestore Database si planeas usarlo (opcional si usas localStorage)
   - Obtén la configuración de Firebase y actualiza los archivos de entorno:

   ```typescript
   firebase: {
     apiKey: "TU_API_KEY",
     authDomain: "tu-proyecto.firebaseapp.com",
     projectId: "tu-proyecto",
     storageBucket: "tu-proyecto.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef1234567890"
   }
   ```

3. **Actualiza el archivo `.firebaserc`:**

   ```json
   {
     "projects": {
       "default": "tu-proyecto-firebase"
     }
   }
   ```

## Paso 2: Construir la aplicación

1. Instala las dependencias del proyecto:

   ```bash
   npm install
   ```

2. Construye la aplicación para producción:

   ```bash
   ng build --configuration production
   ```

   Esto generará los archivos optimizados en la carpeta `dist/matrimonio-app`.

## Paso 3: Desplegar en Firebase Hosting

1. Despliega la aplicación en Firebase Hosting:

   ```bash
   firebase deploy
   ```

2. Después del despliegue, Firebase te proporcionará una URL pública, por ejemplo:
   `https://tu-proyecto-firebase.web.app`

## Paso 4: Generar códigos QR

1. Actualiza el script `scripts/generate-qr.js` con la URL real de tu aplicación desplegada:

   ```javascript
   const appUrl = 'https://matrimonio-lidia.web.app';
   ```

2. Instala la dependencia para generar códigos QR:

   ```bash
   npm install qrcode
   ```

3. Ejecuta el script:

   ```bash
   node scripts/generate-qr.js
   ```

4. Los códigos QR se generarán en la carpeta `qr-codes/` en formatos PNG y SVG.

5. Imprime estos códigos QR y colócalos en las mesas del evento.

## Personalización Adicional

- **Diseño**: Puedes modificar los colores y estilos en `src/styles.scss` y en los archivos `.scss` de los componentes.
- **Carpeta de subida**: Si deseas cambiar la carpeta donde se suben los archivos, edita el parámetro en `file-upload.component.ts`:
  ```typescript
  this.bunnyStorage.uploadFile(this.selectedFile, 'matrimonio-fotos')
  ```

## Solución de problemas

- **Error de CORS**: Si tienes problemas con CORS al subir archivos, asegúrate de que tu Storage Zone en Bunny.net tenga configurados correctamente los headers de CORS.
- **Límite de tamaño**: Si necesitas ajustar el límite de tamaño de los archivos, edita la constante `MAX_FILE_SIZE` en `file-upload.component.ts`.
- **Firebase Hosting**: Si hay problemas con las rutas en Firebase Hosting, verifica que la regla de reescritura en `firebase.json` esté correctamente configurada.

## Otros Recursos

- [Documentación de Bunny.net Storage API](https://docs.bunny.net/reference/storage-api)
- [Documentación de Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Documentación de Angular](https://angular.io/docs)