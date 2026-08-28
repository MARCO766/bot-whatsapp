# MacBot Android

Cliente Android independiente para el CRM MacBot.

## Requisitos

- Android Studio Ladybug o superior
- JDK 17
- Android SDK 35

## Configuración

1. Copia `local.properties.example` a `local.properties`.
2. Configura `sdk.dir` (Android Studio lo hace al abrir el proyecto).
3. Configura `API_BASE_URL` con la URL de tu backend en Render:

```properties
API_BASE_URL=https://tu-app.onrender.com
```

## Ejecutar

Abre la carpeta `macbot-android` en Android Studio y ejecuta en emulador o dispositivo físico.

Desde terminal (con Gradle wrapper):

```bash
cd macbot-android
gradlew.bat assembleDebug
```

## Fase actual

- Fase 0: Scaffold + tema
- Fase 1: Login, sesión `connect.sid`, Home provisional
- Fase 2: Bandeja (lista de conversaciones, filtro por línea, paginación, chat provisional)
