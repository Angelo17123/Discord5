# 🧠 MEMORY — Sin nombre
> Última actualización: 2026-04-04T04:24:49.723Z

---

## 👤 Perfil de Usuario

_Sin datos registrados._


---

## 🤖 Contexto del Agente

_Sin datos registrados._


---

## ⚙️ Datos del Entorno

_Sin datos registrados._


---

## 📁 Proyectos Activos

_Sin datos registrados._


---

## 🔧 Definición de Herramientas

_Sin datos registrados._


---

## 💬 Historial Relevante de Chat

_Sin datos registrados._


---

## 🐛 Errores Registrados y Fixes


### ❌ Error #3f2e1035 — 2026-04-04T04:23:18.017Z
- **Mensaje:** Bot no reconecta cuando Discord lo expulsa del canal (VOICE_STATE_UPDATE con channel_id: null)
- **Contexto:** bot.py - Bot de voz Discord se desconecta y no reconecta automáticamente
- **Tags:** `discord`, `voice`, `reconexion`, `gateway`, `op-code-4`
- **Estado:** `resuelto`


#### ✅ Fix Aplicado
- **Descripcion:** Detectar VOICE_STATE_UPDATE con channel_id=null (expulsión) y reenviar op 4 inmediatamente para reunirse al canal. Worker mute_deaf ahora reintenta cada 30s incluso si fue expulsado.
- **Codigo antes:**
```python
elif op == 0:
    t = msg.get('t', '')
    if t == 'VOICE_STATE_UPDATE' or t == 'VOICE_SERVER_UPDATE':
        logger.info(f"Evento de voz recibido: {t}")
```
- **Codigo despues:**
```python
elif t == 'VOICE_STATE_UPDATE':
    d = msg.get('d', {})
    if d.get('user_id') == user_info['id']:
        current_channel = d.get('channel_id')
        if current_channel is None:
            kicked_from_channel.set()
            reenviar op 4 inmediatamente para reunirse
```

---


### ❌ Error #748bdd6e — 2026-04-04T04:23:18.878Z
- **Mensaje:** Op code 9 desconecta siempre sin distinguir entre d:true (recoverable) y d:false (invalid session)
- **Contexto:** bot.py:189-191 - Manejo de op code 9 (Invalid Session)
- **Tags:** `discord`, `gateway`, `op-code-9`, `invalid-session`
- **Estado:** `resuelto`


#### ✅ Fix Aplicado
- **Descripcion:** Op 9 ahora distingue d=true (sesión inválida no recuperable, limpiar sesión) de d=false (recuperable, mantener sesión para resume).
- **Codigo antes:**
```python
elif op == 9:
    logger.warning(f"Desconexión: {msg.get('d')}")
    break
```
- **Codigo despues:**
```python
elif op == 9:
    invalid_session_data = msg.get('d')
    if invalid_session_data:
        should_resume.clear()
        session_id_global = None
    else:
        should_resume.set()
```

---


### ❌ Error #f581e680 — 2026-04-04T04:23:19.640Z
- **Mensaje:** No guarda session_id ni sequence number, cada reconexión es sesión nueva causando más desconexiones
- **Contexto:** bot.py - Sin implementación de Resume (op code 6)
- **Tags:** `discord`, `gateway`, `resume`, `session-id`
- **Estado:** `resuelto`


#### ✅ Fix Aplicado
- **Descripcion:** Implementado RESUME (op 6). Guarda session_id de READY/RESUMED y sequence de cada mensaje. Reintenta resume al reconectar si la sesión es válida.
- **Codigo antes:**
```python
auth_data = {"op": 2, "d": {"token": token, ...}}
ws.send(json.dumps(auth_data))
```
- **Codigo despues:**
```python
if needs_resume:
    resume_payload = {"op": 6, "d": {"token": token, "session_id": session_id_global, "seq": sequence_global}}
    ws.send(json.dumps(resume_payload))
```

---


### ❌ Error #847eb993 — 2026-04-04T04:23:20.386Z
- **Mensaje:** mute_deaf_worker deja de funcionar cuando voice_connected.clear() y no reintenta unirse
- **Contexto:** bot.py:94 - mute_deaf_worker se detiene al expulsar bot
- **Tags:** `discord`, `voice`, `worker`, `mute-deaf`
- **Estado:** `resuelto`


#### ✅ Fix Aplicado
- **Descripcion:** mute_deaf_worker ahora detecta kicked_from_channel y reenvía op 4 cada 30s incluso si fue expulsado. Ya no se detiene cuando voice_connected.clear().
- **Codigo antes:**
```python
def mute_deaf_worker():
    while running.is_set():
        if voice_connected.is_set() and channel_id_global and guild_id_global:
            enviar verificacion
        else:
            logger.debug("Voice no conectado, saltando verificación")
```
- **Codigo despues:**
```python
def mute_deaf_worker():
    while running.is_set():
        if kicked_from_channel.is_set():
            reenviar union al canal
            kicked_from_channel.clear()
        elif voice_connected.is_set():
            enviar verificacion
```

---


### ❌ Error #924dc20a — 2026-04-04T04:23:21.291Z
- **Mensaje:** Heartbeat se envía sin verificar si recibe ACK, conexión muerta no se detecta
- **Contexto:** bot.py:66-74 - Heartbeat sin verificación de ACK
- **Tags:** `discord`, `gateway`, `heartbeat`, `ack`
- **Estado:** `resuelto`


#### ✅ Fix Aplicado
- **Descripcion:** Heartbeat ahora trackea ACKs recibidos. Si pasan 2.5x el intervalo sin ACK, reconecta automáticamente.
- **Codigo antes:**
```python
def send_heartbeat(ws, heartbeat_interval, stop_event):
    while not stop_event.is_set():
        time.sleep(heartbeat_interval / 1000)
        ws.send(json.dumps({"op": 1, "d": None}))
```
- **Codigo despues:**
```python
def send_heartbeat(ws, heartbeat_interval, stop_event):
    last_ack_time = time.time()
    consecutive_missed_acks = 0
    while not stop_event.is_set():
        time_since_last_ack = now - last_ack_time
        timeout_threshold = (heartbeat_interval / 1000) * HEARTBEAT_ACK_TIMEOUT_MULTIPLIER
        if time_since_last_ack > timeout_threshold and consecutive_missed_acks > 0:
            break
```

---


### ❌ Error #50a8e95b — 2026-04-04T04:23:22.531Z
- **Mensaje:** Backoff lineal en lugar de exponencial con jitter, causa reconexiones ineficientes y posible ratelimiting
- **Contexto:** bot.py:243 - Backoff de reconexión lineal
- **Tags:** `discord`, `reconexion`, `backoff`, `ratelimit`
- **Estado:** `resuelto`


#### ✅ Fix Aplicado
- **Descripcion:** Backoff exponencial con jitter (2^attempt * base + random 0-50%). Máximo 120 segundos. Evita ratelimiting de Discord.
- **Codigo antes:**
```python
delay = RECONNECT_DELAY * (reconnect_attempts + 1)
```
- **Codigo despues:**
```python
def calculate_backoff(attempt):
    delay = RECONNECT_DELAY_BASE * (2 ** attempt)
    jitter = random.uniform(0, delay * 0.5)
    return min(delay + jitter, 120)
```

---


## 💡 Snippets de Código

No hay snippets guardados.


---

## 📊 Estadísticas
- Total de errores registrados: 6
- Errores resueltos: 6
- Errores pendientes: 0
- Snippets guardados: 0
- Memorias almacenadas: 0
- Última sesión activa: 2026-04-04T04:24:44.139Z
