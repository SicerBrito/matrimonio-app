import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

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
    HttpClientModule
  ],
  providers: [
    BunnyStorageService,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }