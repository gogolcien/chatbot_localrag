## Base de datos

Este proyecto usa **MySQL 8** para almacenar las preguntas pendientes de revisión y las aprobadas (caché semántico). Ya no se usan archivos JSON como almacenamiento (los antiguos `pendientes.json` / `aprobadas.json` se conservan solo como respaldo histórico).

### Requisitos previos
- MySQL Server 8.x instalado y corriendo (local o remoto).
- Node.js con el paquete `mysql2` (ya incluido en `package.json`).

### Configuración inicial

1. Crea la base de datos:
```sql
CREATE DATABASE chatbot_localrag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Crea las tablas:
```sql
CREATE TABLE aprobadas (
  id CHAR(36) PRIMARY KEY,
  pregunta TEXT NOT NULL,
  pregunta_normalizada VARCHAR(500),
  respuesta TEXT NOT NULL,
  embedding JSON,
  tags JSON,
  origen VARCHAR(20) DEFAULT 'manual',
  usos INT DEFAULT 0,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pregunta_normalizada (pregunta_normalizada(191))
);

CREATE TABLE pendientes (
  id CHAR(36) PRIMARY KEY,
  pregunta TEXT NOT NULL,
  pregunta_normalizada VARCHAR(500),
  respuesta TEXT NOT NULL,
  embedding JSON,
  agente VARCHAR(100),
  contexto_usado JSON,
  menu_mention JSON,
  estado VARCHAR(20) DEFAULT 'pendiente',
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

3. Copia `.env.example` a `.env` (o edita tu `.env`) y define:
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

4. Si vienes de una versión anterior del proyecto con datos en JSON, puedes migrarlos una sola vez con:
```bash
node backend/scripts/migrate-json-to-mysql.js
```