import json
import os
import time
import logging
import asyncio
import threading
import random
from dotenv import load_dotenv
from aiohttp import web
import websocket as ws_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('bot.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuración desde ENV
TOKEN = os.environ.get('TOKEN', '').strip().strip('"\'')  # Limpiar espacios y comillas
GUILD_ID = os.environ.get('GUILD_ID', '')
TARGET_CHANNEL_ID = os.environ.get('CHANNEL_ID', '1374566026003611718')
STATUS = os.environ.get('STATUS', 'online')
SELF_MUTE = os.environ.get('SELF_MUTE', 'true').lower() == 'true'
SELF_DEAF = os.environ.get('SELF_DEAF', 'true').lower() == 'true'

# Constantes críticas para 24/7
DATA_FILE = 'state.json'
RECONNECT_DELAY_BASE = 3  # Más rápido al inicio
MAX_RECONNECT_ATTEMPTS = 50  # Más intentos antes de rendirse
HEARTBEAT_ACK_TIMEOUT = 1.5  # Multiplicador más estricto para detectar desconexiones rápido

# Intents necesarios para recibir eventos de voz
INTENTS = (1 << 0) | (1 << 7)  # GUILDS (1) + GUILD_VOICE_STATES (8) = 1 + 128 = 129

# Variables globales
ws_global = None
ws_lock = threading.Lock()
channel_id_global = None
guild_id_global = None
running = threading.Event()
voice_connected = threading.Event()
voice_connecting = threading.Event()  # Nuevo: evitar múltiples intentos simultáneos
session_id_global = None
sequence_global = None
should_resume = threading.Event()
kicked_from_channel = threading.Event()
watchdog_stop = threading.Event()
heartbeat_ack_received = threading.Event()
resume_fail_count = 0
cached_user_id = None
last_voice_state_update = 0  # Timestamp del último update de voz

def load_state():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
                return data.get('channel_id'), data.get('session_id'), data.get('sequence')
        except Exception as e:
            logger.error(f"Error cargando estado: {e}")
    return None, None, None

def save_state(channel_id, session_id=None, sequence=None):
    try:
        data = {
            'channel_id': channel_id,
            'session_id': session_id,
            'sequence': sequence,
            'timestamp': time.time()
        }
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        logger.error(f"Error guardando estado: {e}")

def get_user_info(token):
    import requests
    if not token:
        return None
    headers = {"Authorization": token, "Content-Type": "application/json"}
    try:
        resp = requests.get('https://discord.com/api/v10/users/@me', headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 401:
            logger.error("TOKEN INVÁLIDO (401). Verifica tu token en el dashboard de Render.")
            return None
        else:
            logger.error(f"get_user_info HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"get_user_info excepción: {e}")
    return None

def send_heartbeat(ws, heartbeat_interval, stop_event):
    """Loop de heartbeat con detección temprana de ACKs perdidos"""
    global resume_fail_count
    consecutive_missed = 0
    
    while not stop_event.is_set():
        try:
            # Esperar intervalo (en segundos)
            wait_time = heartbeat_interval / 1000
            
            # Esperar señal de ACK o timeout
            ack_received = heartbeat_ack_received.wait(timeout=wait_time)
            
            if stop_event.is_set():
                break
                
            if not ack_received and consecutive_missed > 0:
                # No llegó ACK del heartbeat anterior
                consecutive_missed += 1
                logger.warning(f"ACK perdido ({consecutive_missed}/2)")
                if consecutive_missed >= 2:
                    logger.error("Demasiados ACKs perdidos. Forzando reconexión...")
                    break
            else:
                consecutive_missed = 0
            
            # Limpiar evento y enviar nuevo heartbeat
            heartbeat_ack_received.clear()
            
            with ws_lock:
                if ws and ws.sock and ws.sock.connected:
                    ws.send(json.dumps({"op": 1, "d": sequence_global}))
                    logger.debug("Heartbeat enviado")
                else:
                    logger.warning("WebSocket no conectado al enviar heartbeat")
                    break
                    
            consecutive_missed += 1  # Contar este heartbeat como pendiente
            
        except Exception as e:
            logger.error(f"Error en heartbeat: {e}")
            break

def update_voice_state(ws, channel_id, guild_id, mute, deaf):
    """Enviar update de estado de voz (op 4)"""
    payload = {
        "op": 4,
        "d": {
            "guild_id": str(guild_id) if guild_id else None,
            "channel_id": str(channel_id) if channel_id else None,
            "self_mute": mute,
            "self_deaf": deaf
        }
    }
    try:
        with ws_lock:
            if ws and ws.sock and ws.sock.connected:
                ws.send(json.dumps(payload))
                logger.info(f"Voice state: canal={channel_id}, mute={mute}, deaf={deaf}")
                return True
    except Exception as e:
        logger.error(f"Error enviando voice state: {e}")
    return False

def force_reconnect_voice():
    """Forzar reconexión al canal si parece que nos sacaron"""
    global ws_global
    try:
        with ws_lock:
            if ws_global and ws_global.sock and ws_global.sock.connected:
                update_voice_state(ws_global, channel_id_global, guild_id_global, SELF_MUTE, SELF_DEAF)
                logger.info("Forzando re-conexión al canal de voz")
                return True
    except Exception as e:
        logger.error(f"Error en force_reconnect: {e}")
    return False

def voice_keepalive_worker():
    """Worker que reenvía el estado de voz periódicamente para mantener la conexión viva"""
    while running.is_set():
        try:
            time.sleep(25)  # Cada 25 segundos (menos que el heartbeat)
            
            if not voice_connected.is_set() or kicked_from_channel.is_set():
                continue
                
            # Si no hemos recibido VOICE_STATE_UPDATE en 60 segundos, forzar reconexión
            if time.time() - last_voice_state_update > 60:
                logger.warning("No se recibieron updates de voz en 60s. Re-conectando...")
                force_reconnect_voice()
            else:
                # Reenviar estado actual para mantener vivo el socket
                logger.debug("Keepalive: reenviando estado de voz")
                force_reconnect_voice()
                
        except Exception as e:
            logger.error(f"Error en keepalive: {e}")

def watchdog_worker(stop_event):
    """Monitorea el estado general del bot"""
    start_time = time.time()
    while not stop_event.is_set():
        try:
            time.sleep(60)  # Log cada minuto
            if stop_event.is_set():
                break
                
            uptime = int((time.time() - start_time) / 60)
            conn_status = "CONECTADO" if voice_connected.is_set() else "DESCONECTADO"
            logger.info(f"Estado: {conn_status} | Uptime: {uptime}min | Canal: {channel_id_global}")
            
            # Si llevamos más de 2 minutos desconectados, intentar reconexión urgente
            if not voice_connected.is_set() and uptime > 2:
                logger.warning("Watchdog: detectada desconexión prolongada")
                
        except Exception as e:
            logger.error(f"Error en watchdog: {e}")

def run_voice_connection(token, channel_id, guild_id, status, self_mute, self_deaf):
    """Conexión principal al Gateway de Discord"""
    global ws_global, channel_id_global, guild_id_global, session_id_global
    global sequence_global, resume_fail_count, cached_user_id, last_voice_state_update
    
    if not token:
        logger.error("No hay TOKEN configurado. Deteniendo.")
        return False
        
    ws = ws_client.WebSocket()
    gateway_url = 'wss://gateway.discord.gg/?v=10&encoding=json'  # v10 más estable
    stop_heartbeat = threading.Event()
    heartbeat_thread = None
    disconnect_reason = None
    
    channel_id_global = channel_id
    guild_id_global = guild_id
    voice_connecting.set()
    
    try:
        logger.info(f"Conectando al Gateway (intento)...")
        ws.connect(gateway_url, timeout=10)
        
        # Recibir Hello
        hello = json.loads(ws.recv())
        if hello.get('op') != 10:
            logger.error(f"Esperaba Hello (op 10), recibí: {hello.get('op')}")
            return False
            
        heartbeat_interval = hello['d']['heartbeat_interval']
        logger.info(f"Heartbeat interval: {heartbeat_interval}ms")
        
        # Determinar si hacemos RESUME o IDENTIFY
        needs_resume = should_resume.is_set() and session_id_global and sequence_global is not None
        
        if needs_resume:
            logger.info(f"Resumiendo sesión (id={session_id_global[:8]}..., seq={sequence_global})")
            ws.send(json.dumps({
                "op": 6,
                "d": {
                    "token": token,
                    "session_id": session_id_global,
                    "seq": sequence_global
                }
            }))
        else:
            logger.info("Enviando IDENTIFY fresh")
            ws.send(json.dumps({
                "op": 2,
                "d": {
                    "token": token,
                    "intents": INTENTS,  # INTENTS correctos para recibir eventos de voz
                    "properties": {
                        "os": "linux",
                        "browser": "Discord Voice Bot",
                        "device": "linux"
                    },
                    "presence": {
                        "status": status,
                        "afk": False
                    }
                }
            }))
        
        # Enviar estado de voz inicial
        time.sleep(0.5)  # Pequeña pausa para asegurar que el IDENTIFY se procese
        update_voice_state(ws, channel_id, guild_id, self_mute, self_deaf)
        
        with ws_lock:
            ws_global = ws
        
        # Iniciar heartbeat
        heartbeat_ack_received.set()  # Primer heartbeat libre
        heartbeat_thread = threading.Thread(
            target=send_heartbeat, 
            args=(ws, heartbeat_interval, stop_heartbeat),
            daemon=True
        )
        heartbeat_thread.start()
        
        # Loop principal de eventos
        while True:
            try:
                data = ws.recv()
                if not data:
                    disconnect_reason = "empty_data"
                    break
                    
                msg = json.loads(data)
                op = msg.get('op')
                seq = msg.get('s')
                event_type = msg.get('t')
                
                if seq is not None:
                    sequence_global = seq
                
                # Heartbeat ACK
                if op == 11:
                    heartbeat_ack_received.set()
                    resume_fail_count = 0
                    logger.debug("Heartbeat ACK")
                
                # Reconnect request (op 7)
                elif op == 7:
                    logger.warning("Discord solicitó reconexión (op 7)")
                    should_resume.set()
                    disconnect_reason = "reconnect_requested"
                    break
                
                # Invalid Session (op 9)
                elif op == 9:
                    resumable = msg.get('d', False)
                    if resumable and resume_fail_count < 3:
                        resume_fail_count += 1
                        logger.warning(f"Session inválida pero resumable (intento {resume_fail_count})")
                        should_resume.set()
                    else:
                        logger.warning("Session inválida, identificación limpia necesaria")
                        should_resume.clear()
                        session_id_global = None
                        sequence_global = None
                        resume_fail_count = 0
                    disconnect_reason = "invalid_session"
                    break
                
                # Dispatch (op 0)
                elif op == 0:
                    if event_type == 'READY':
                        session_id_global = msg['d'].get('session_id')
                        user_data = msg['d'].get('user', {})
                        cached_user_id = user_data.get('id')
                        logger.info(f"READY: {user_data.get('username')} (sess: {session_id_global[:8]}...)")
                        
                    elif event_type == 'RESUMED':
                        logger.info("Sesión resumida exitosamente")
                        voice_connected.set()
                        
                    elif event_type == 'VOICE_STATE_UPDATE':
                        d = msg.get('d', {})
                        last_voice_state_update = time.time()
                        
                        if d.get('user_id') == cached_user_id:
                            new_channel = d.get('channel_id')
                            
                            if new_channel is None:
                                # Nos sacaron del canal!
                                logger.warning("Detectado: Bot expulsado del canal!")
                                kicked_from_channel.set()
                                voice_connected.clear()
                                
                                # Reconectar inmediatamente
                                time.sleep(1)
                                update_voice_state(ws, channel_id_global, guild_id_global, self_mute, self_deaf)
                                
                            else:
                                # Estamos en un canal (posiblemente movidos)
                                if str(new_channel) != str(channel_id_global):
                                    logger.info(f"Movido al canal {new_channel}")
                                    channel_id_global = new_channel
                                    save_state(new_channel)
                                kicked_from_channel.clear()
                                voice_connected.set()
                                logger.info(f"Confirmado en canal: {new_channel}")
                    
                    elif event_type == 'VOICE_SERVER_UPDATE':
                        logger.debug("Voice server update recibido")
                        
            except ws_client.WebSocketConnectionClosedException:
                logger.warning("WebSocket cerrado inesperadamente")
                disconnect_reason = "connection_closed"
                break
            except Exception as e:
                logger.error(f"Error procesando mensaje: {e}")
                disconnect_reason = "error"
                break
                
    except Exception as e:
        logger.error(f"Error crítico en conexión: {e}")
        disconnect_reason = "fatal_error"
        
    finally:
        logger.info(f"Cerrando conexión (razón: {disconnect_reason})")
        
        # Limpiar sesión solo si fue error inesperado (no reconexión controlada)
        if disconnect_reason in ('connection_closed', 'fatal_error', 'error', 'empty_data'):
            if resume_fail_count >= 3:
                logger.info("Limpiando sesión tras múltiples fallos")
                session_id_global = None
                sequence_global = None
                should_resume.clear()
        
        stop_heartbeat.set()
        voice_connected.clear()
        voice_connecting.clear()
        
        if heartbeat_thread and heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=3)
        
        try:
            ws.close()
        except:
            pass
            
        with ws_lock:
            if ws_global == ws:
                ws_global = None
                
        return disconnect_reason != "fatal_error"

def calculate_backoff(attempt):
    """Backoff exponencial con jitter"""
    delay = min(RECONNECT_DELAY_BASE * (2 ** attempt), 60)  # Max 60s
    jitter = random.uniform(0, delay * 0.3)
    return delay + jitter

def voice_worker():
    """Worker principal que mantiene la conexión viva indefinidamente"""
    global channel_id_global, session_id_global, sequence_global, cached_user_id
    
    logger.info("=== INICIANDO VOICE WORKER (24/7 MODE) ===")
    
    # Validar token primero
    if not TOKEN:
        logger.error("!!! ERROR: No se encontró TOKEN en variables de entorno !!!")
        logger.error("Añade TOKEN en el dashboard de Render (Settings -> Environment Variables)")
        return
    
    # Obtener info del bot (con reintentos infinitos hasta lograrlo)
    user_info = None
    attempt = 0
    while not user_info and running.is_set():
        user_info = get_user_info(TOKEN)
        if user_info:
            cached_user_id = user_info['id']
            logger.info(f"Bot autenticado: {user_info['username']}#{user_info.get('discriminator', '0')} ({cached_user_id})")
            break
        else:
            wait = min(5 * (attempt + 1), 30)
            logger.warning(f"Reintentando auth en {wait}s...")
            time.sleep(wait)
            attempt += 1
    
    if not user_info:
        return
    
    # Cargar estado anterior
    saved_channel, saved_session, saved_seq = load_state()
    channel_id_global = saved_channel or TARGET_CHANNEL_ID
    
    if saved_session and saved_seq:
        session_id_global = saved_session
        sequence_global = saved_seq
        should_resume.set()
        logger.info("Estado anterior encontrado, se intentará RESUME")
    
    running.set()
    reconnect_attempts = 0
    
    while running.is_set():
        try:
            if reconnect_attempts >= MAX_RECONNECT_ATTEMPTS:
                logger.error("Máximo de intentos alcanzado, esperando 60s...")
                time.sleep(60)
                reconnect_attempts = 0
                should_resume.clear()
                session_id_global = None
                sequence_global = None
            
            # Evitar múltiples conexiones simultáneas
            if voice_connecting.is_set():
                time.sleep(1)
                continue
            
            logger.info(f"Conectando a canal {channel_id_global} (intento {reconnect_attempts + 1})")
            success = run_voice_connection(TOKEN, channel_id_global, GUILD_ID, STATUS, SELF_MUTE, SELF_DEAF)
            
            if not success:
                reconnect_attempts += 1
            else:
                reconnect_attempts = 0  # Reset en conexión exitosa
            
            delay = calculate_backoff(reconnect_attempts)
            logger.info(f"Reconectando en {delay:.1f}s...")
            time.sleep(delay)
            
        except Exception as e:
            logger.error(f"Error en voice_worker: {e}")
            time.sleep(5)

async def health_check(request):
    """Health check para Render (debe retornar 200 si el proceso está vivo)"""
    is_voice = voice_connected.is_set()
    status = "connected" if is_voice else "connecting"
    
    # Importante: Render necesita 200 para no reiniciar el servicio
    # Aunque no esté en el canal aún, si el proceso está intentando, es 200
    return web.json_response({
        "status": status,
        "voice_connected": is_voice,
        "channel_id": channel_id_global,
        "timestamp": time.time(),
        "uptime": "active"
    }, status=200)

async def start_web_server():
    app = web.Application()
    app.router.add_get('/health', health_check)
    app.router.add_get('/', health_check)
    
    port = int(os.environ.get('PORT', 10000))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logger.info(f"Servidor web en puerto {port}")

async def main_async():
    logger.info("=== BOT DE VOZ 24/7 INICIANDO ===")
    logger.info(f"Canal objetivo: {TARGET_CHANNEL_ID}")
    logger.info(f"Intents configurados: {INTENTS}")
    
    # Iniciar web server primero para que Render no nos mate
    await start_web_server()
    
    if not TOKEN:
        logger.error("CRÍTICO: No hay TOKEN. Configúralo en Render.")
        # Mantener vivo el web server para mostrar error
        while True:
            await asyncio.sleep(3600)
    
    # Iniciar workers en threads separados
    loop = asyncio.get_event_loop()
    
    voice_thread = threading.Thread(target=voice_worker, daemon=True)
    voice_thread.start()
    
    keepalive_thread = threading.Thread(target=voice_keepalive_worker, daemon=True)
    keepalive_thread.start()
    
    watchdog_thread = threading.Thread(target=watchdog_worker, args=(watchdog_stop,), daemon=True)
    watchdog_thread.start()
    
    # Mantener el loop de asyncio vivo
    while True:
        await asyncio.sleep(3600)

def main():
    asyncio.run(main_async())

if __name__ == '__main__':
    main()