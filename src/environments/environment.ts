export const environment = {
    production: false,
    bunnyStorage: {
        storageZoneName: 'c1a77494-a7fb-4a87-9ee7270547be-8de7-4696',
        accessKey: 'TU_ACCESS_KEY',
        endpoint: 'https://storage.bunnycdn.com',
        region: '' // Deja vacío para la región por defecto, o usa 'de', 'uk', etc.
    },
    bunnyCdn: {
        apiKey: 'c1a77494-a7fb-4a87-9ee7270547be-8de7-4696',
        libraryId: '288685',
        baseUrl: 'https://video.bunnycdn.com/library'
    },
    firebaseConfig: {
        apiKey: "AIzaSyBufhiZyBHwjPdCf6R6MDWFCJVh-f7Ms1o",
        authDomain: "matrimonio-lidia.firebaseapp.com",
        projectId: "matrimonio-lidia",
        storageBucket: "matrimonio-lidia.firebasestorage.app",
        messagingSenderId: "856603716293",
        appId: "1:856603716293:web:3e3e85eb53346826b61eac",
        measurementId: "G-N2YG9BWVKZ"
    },
    // Si prefieres almacenamiento local en lugar de Firestore
    useLocalStorage: true
};