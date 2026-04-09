# 🤖 Discord Selfbot Pro v2.0

Un selfbot profesional de Discord con arquitectura modular, sistema de comandos avanzado, gestión de voz inteligente, protección contra raids y dashboard web.

## ✨ Características

### 🎯 Core
- **Arquitectura modular** con TypeScript
- **Sistema de comandos** con cooldowns y aliases
- **Logging profesional** con Winston
- **Anti-crash system** para máxima estabilidad
- **Watchdog** para reconexión automática
- **Gestión de voz** inteligente con bloqueo de canal

### 🛡️ Seguridad
- **Protección contra raids** con detección automática
- **Auto-responder** a DMs
- **Alertas de menciones** via webhook
- **Sistema de permisos** por comando

### 🎮 Comandos
- **General**: `help`, `ping`, `stats`, `uptime`
- **Voz**: `voice join/leave/status/move/lock`
- **Utilidad**: `userinfo`, `serverinfo`, `avatar`, `purge`, `afk`, `snipe`
- **Moderación**: `raid` (control de protección)
- **Diversión**: `say`, `embed`
- **Developer**: `eval`, `restart`

### 📊 Dashboard Web
- **Monitoreo en tiempo real** de estadísticas
- **Logs en vivo** con filtros por nivel
- **Control remoto** del bot
- **Interfaz moderna** y responsive

## 🚀 Instalación

### Requisitos
- Node.js 18+
- NPM o Yarn
- PM2 (para producción)

### Paso 1: Clonar y instalar

```bash
git clone <repo>
cd discord-selfbot
npm install
```

### Paso 2: Configurar

```bash
cp .env.example .env
# Editar .env con tu configuración
```

Variables obligatorias:
```env
DISCORD_TOKEN=tu_token_aqui
BASE_CHANNEL_ID=1374565606967214100
```

### Paso 3: Compilar

```bash
npm run build
```

### Paso 4: Ejecutar

**Desarrollo:**
```bash
npm run dev
```

**Producción con PM2:**
```bash
npm run pm2:start
```

## 📖 Uso

### Comandos de Voz

El bot se conecta automáticamente al canal base configurado. Cuando **tú** lo mueves a otro canal, ese se convierte en el nuevo objetivo y el bot nunca lo abandonará.

```
!!voice join        - Conectar al canal objetivo
!!voice leave       - Desconectar
!!voice status      - Ver estado de conexión
!!voice move #canal - Mover a otro canal
!!voice lock        - Bloquear canal actual como objetivo
```

### Protección contra Raids

```
!!raid status   - Ver estado de protección
!!raid enable   - Activar protección
!!raid disable  - Desactivar protección
!!raid unlock   - Desbloquear guild
```

### Auto-Responder

Configura en `.env`:
```env
AUTO_RESPONDER_ENABLED=true
AUTO_RESPONDER_MESSAGE=Hola, no estoy disponible ahora.
```

### Dashboard Web

Accede en `http://localhost:3000`

Configura contraseña en `.env`:
```env
DASHBOARD_PASSWORD=tu_contraseña_segura
```

## ⚙️ Configuración Avanzada

### Webhook de Notificaciones

```env
WEBHOOK_URL=https://discord.com/api/webhooks/...
MENTION_ALERTS=true
DM_ALERTS=true
```

### Niveles de Log

```env
LOG_LEVEL=info  # error, warn, info, debug, silly
```

### Intervalos

```env
WATCHDOG_INTERVAL=30000    # Verificar conexión cada 30s
RECONNECT_DELAY=3000       # Esperar 3s antes de reconectar
```

## 📁 Estructura del Proyecto

```
discord-selfbot/
├── src/
│   ├── commands/          # Comandos del bot
│   ├── events/            # Event handlers
│   ├── handlers/          # Command/Event handlers
│   ├── modules/           # Módulos (VoiceManager, RaidProtection)
│   ├── types/             # Tipos TypeScript
│   ├── utils/             # Utilidades (logger, config)
│   └── index.ts           # Punto de entrada
├── dashboard/             # Dashboard web
│   ├── server.js          # Servidor Express
│   └── public/            # Archivos estáticos
├── logs/                  # Logs generados
├── config/                # Configuraciones adicionales
├── .env                   # Variables de entorno
├── .env.example           # Ejemplo de configuración
├── package.json
├── tsconfig.json
├── ecosystem.config.js    # Configuración PM2
└── README.md
```

## 🛠️ Comandos NPM

```bash
npm run build          # Compilar TypeScript
npm run start          # Ejecutar versión compilada
npm run dev            # Ejecutar en desarrollo
npm run watch          # Compilar en modo watch
npm run pm2:start      # Iniciar con PM2
npm run pm2:stop       # Detener PM2
npm run pm2:restart    # Reiniciar PM2
npm run pm2:logs       # Ver logs de PM2
npm run dashboard      # Iniciar solo dashboard
npm run clean          # Limpiar dist/
```

## 📝 Crear Comandos Personalizados

```typescript
import { Message, EmbedBuilder } from 'discord.js-selfbot-v13';
import { Command, ExtendedClient } from '../types';

export const miComando: Command = {
  name: 'micomando',
  aliases: ['mc', 'alias'],
  description: 'Descripción del comando',
  category: 'general',
  usage: '[argumento]',
  cooldown: 5,
  permissions: 'everyone', // everyone, trusted, admin, owner
  async execute(client: ExtendedClient, message: Message, args: string[]) {
    // Tu código aquí
    await message.reply('¡Hola!');
  },
};

export default miComando;
```

## 🔒 Seguridad

> ⚠️ **ADVERTENCIA**: Los selfbots violan los Términos de Servicio de Discord.
> Úsalo bajo tu propio riesgo y solo en cuentas que no te importe perder.

### Recomendaciones:
- No abuses de los comandos (rate limits)
- No uses el bot en servidores grandes sin permiso
- Mantén tu token seguro
- No compartas tu configuración

## 🐛 Troubleshooting

### Error: "Token inválido"
- Verifica que tu token sea correcto
- Asegúrate de que la cuenta no esté baneada

### No se conecta al canal de voz
- Verifica que el ID del canal sea correcto
- Asegúrate de tener permisos para conectar

### Error de rate limit
- Reduce la frecuencia de comandos
- Aumenta los cooldowns

### PM2 no reinicia el bot
- Verifica la configuración de ecosystem.config.js
- Revisa los logs: `npm run pm2:logs`

## 📊 Monitoreo

### Logs
Los logs se guardan en `/logs`:
- `general-YYYY-MM-DD.log` - Logs generales
- `error-YYYY-MM-DD.log` - Errores
- `debug-YYYY-MM-DD.log` - Debug detallado
- `exceptions.log` - Excepciones no manejadas

### Dashboard
Accede a métricas en tiempo real:
- Comandos ejecutados
- Mensajes recibidos
- Conexiones de voz
- Logs en vivo

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit tus cambios: `git commit -am 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crea un Pull Request

## 📜 Licencia

MIT License - Usa bajo tu propia responsabilidad.

## 🙏 Créditos

- [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13)
- [Winston](https://github.com/winstonjs/winston)
- [PM2](https://pm2.keymetrics.io/)

---

<p align="center">
  <strong>Discord Selfbot Pro v2.0</strong><br>
  Desarrollado con ❤️ para la comunidad
</p>
