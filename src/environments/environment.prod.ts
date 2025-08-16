export const environment = {
    production: true,
    bunnyStorage: {
        storageZoneName: 'corestorageahdo2',
        apiKey: 'd3f4a3bc-5e47-4cef-a20197e917a7-76f3-4679',
        endpoint: 'https://storage.bunnycdn.com',
        region: '' // Deja vacío para la región por defecto, o usa 'de', 'uk', etc.
    },
    firebase: {
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