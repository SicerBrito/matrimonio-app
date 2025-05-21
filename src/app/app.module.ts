import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { environment } from '../environments/environment';

// Firebase
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';

// Componentes
import { AppComponent } from './app.component';
import { FileUploadComponent } from './components/file-upload/file-upload.component';

// Servicios
import { BunnyStorageService } from './services/bunny-storage.service';
// import { MetadataService } from './services/metadata.service';

@NgModule({
  declarations: [
    AppComponent,
    FileUploadComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    HttpClientModule,
    // Solo importar Firebase si no estamos usando localStorage
    ...(!environment.useLocalStorage ? [
      AngularFireModule.initializeApp(environment.firebaseConfig),
      AngularFirestoreModule
    ] : [])
  ],
  providers: [
    BunnyStorageService,
    // MetadataService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }