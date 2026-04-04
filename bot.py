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

DATA_FILE = 'state.json'

TOKEN = os.environ.get('TOKEN', '')
GUILD_ID = os.environ.get('GUILD_ID', '')
TARGET_CHANNEL_ID = os.environ.get('CHANNEL_ID', '1374566026003611718')
STATUS = os.environ.get('STATUS', 'online')
SELF_MUTE = os.environ.get('SELF_MUTE', 'true').lower() == 'true'
SELF_DEAF = os.environ.get('SELF_DEAF', 'true').lower() == 'true'

RECONNECT_DELAY_BASE = 5
MAX_RECONNECT_ATTEMPTS = 20
HEARTBEAT_ACK_TIMEOUT_MULTIPLIER = 2.5

ws_global = None
ws_lock = threading.Lock()
channel_id_global = None
guild_id_global = None
running = threading.Event()
voice_connected = threading.Event()
session_id_global = None
sequence_global = None
should_resume = threading.Event()
kicked_from_channel = threading.Event()
watchdog_stop = threading.Event()
last_heartbeat_ack_time = time.time()
heartbeat_ack_lock = threading.Lock()
heartbeat_ack_received = threading.Event()  # FIX: evento para señalizar ACK al hilo de heartbeat
resume_fail_count = 0
max_resume_fails = 3
cached_user_id = None  # FIX: cache del user_id para no llamar a la API en cada evento

def load_state():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
                return data.get('channel_id'), data.get('session_id'), data.get('sequence')
        except Exception as e:
            logger.error(f"Error al cargar estado: {e}")
    return None, None, None

def save_state(channel_id, session_id=None, sequence=None):
    try:
        data = {'channel_id': channel_id}
        if session_id:
            data['session_id'] = session_id
        if sequence is not None:
            data['sequence'] = sequence
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        logger.error(f"Error al guardar estado: {e}")

def get_user_info(token):
    import requests
    headers = {"Authorization": f"Bot {token}", "Content-Type": "application/json"}
    try:
        resp = requests.get('https://discord.com/api/v9/users/@me', headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        else:
            logger.error(f"get_user_info falló: HTTP {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        logger.error(f"get_user_info excepción: {e}")
    return None

def send_heartbeat(ws, heartbeat_interval, stop_event):
    """
    FIX PRINCIPAL: Ahora usa heartbeat_ack_received (threading.Event) para
    saber si el ACK fue recibido, en vez de depender de last_heartbeat_ack_time
    que tenía problemas de scope con 'global'.
    """
    consecutive_missed_acks = 0

    while not stop_event.is_set():
        try:
            # Esperar el intervalo de heartbeat
            time.sleep(heartbeat_interval / 1000)

            if stop_event.is_set():
                break

            # FIX: Verificar si se recibió ACK del heartbeat anterior
            if consecutive_missed_acks > 0:
                if heartbeat_ack_received.is_set():
                    # Se recibió ACK, resetear contador
                    consecutive_missed_acks = 0
                else:
                    # No se recibió ACK
                    logger.warning(f"Heartbeat ACK perdido ({consecutive_missed_acks} consecutivos)")
                    if consecutive_missed_acks >= 2:
                        logger.warning("Demasiados ACK perdidos. Forzando reconexión...")
                        break

            # Limpiar el evento antes de enviar nuevo heartbeat
            heartbeat_ack_received.clear()

            # Enviar heartbeat
            ws.send(json.dumps({"op": 1, "d": sequence_global}))
            logger.debug("Heartbeat enviado")
            consecutive_missed_acks += 1

        except Exception as e:
            logger.warning(f"Error enviando heartbeat: {e}")
            break

def update_voice_state(ws, channel_id, guild_id, mute, deaf):
    voice_state = {
        "op": 4,
        "d": {
            "guild_id": str(guild_id) if guild_id else None,
            "channel_id": str(channel_id),
            "self_mute": mute,
            "self_deaf": deaf
        }
    }
    with ws_lock:
        ws.send(json.dumps(voice_state))
    logger.info(f"Estado de voz actualizado: canal={channel_id}, mute={mute}, deaf={deaf}")

def mute_deaf_worker():
    while running.is_set():
        try:
            time.sleep(30)

            if kicked_from_channel.is_set():
                logger.info("Worker detectó expulsión. Reintentando unirse al canal...")
                with ws_lock:
                    if ws_global and voice_connected.is_set():
                        verification_payload = {
                            "op": 4,
                            "d": {
                                "guild_id": str(guild_id_global),
                                "channel_id": str(channel_id_global),
                                "self_mute": True,
                                "self_deaf": True
                            }
                        }
                        try:
                            ws_global.send(json.dumps(verification_payload))
                            logger.info("Reenvío de unión al canal tras expulsión")
                            kicked_from_channel.clear()
                        except Exception as e:
                            logger.warning(f"Error al reenviar unión: {e}")

            elif voice_connected.is_set() and channel_id_global and guild_id_global:
                expected_channel = str(channel_id_global)

                verification_payload = {
                    "op": 4,
                    "d": {
                        "guild_id": str(guild_id_global),
                        "channel_id": expected_channel,
                        "self_mute": True,
                        "self_deaf": True
                    }
                }

                try:
                    with ws_lock:
                        if ws_global:
                            ws_global.send(json.dumps(verification_payload))
                    logger.debug("Verificación de presencia enviada")
                except Exception as e:
                    logger.warning(f"Error al verificar presencia: {e}")
            else:
                logger.debug("Voice no conectado, saltando verificación")

        except Exception as e:
            logger.warning(f"Error en worker de mute/deaf: {e}")

def watchdog_worker(stop_event):
    start_time = time.time()  # FIX: usar start_time real en vez de last_log_time
    while not stop_event.is_set():
        try:
            time.sleep(120)
            if stop_event.is_set():
                break
            if voice_connected.is_set():
                uptime = time.time() - start_time
                mins = int(uptime // 60)
                logger.info(f"Bot activo - canal: {channel_id_global}, uptime: {mins} min")
        except Exception as e:
            logger.warning(f"Error en watchdog: {e}")

def run_voice_connection(token, channel_id, guild_id, status, self_mute, self_deaf, reconnect_attempts=0):
    # FIX: Declarar TODAS las variables globales que se modifican
    global ws_global, channel_id_global, guild_id_global, session_id_global
    global sequence_global, resume_fail_count, last_heartbeat_ack_time, cached_user_id

    ws = ws_client.WebSocket()
    gateway_url = 'wss://gateway.discord.gg/?v=9&encoding=json'
    stop_heartbeat = threading.Event()
    heartbeat_thread = None
    heartbeat_interval = None
    needs_resume = should_resume.is_set() and session_id_global and sequence_global is not None
    disconnect_reason = None  # FIX: track why we exited

    channel_id_global = channel_id
    guild_id_global = guild_id

    try:
        logger.info(f"Conectando al gateway de Discord...")
        ws.connect(gateway_url)
        hello = json.loads(ws.recv())
        heartbeat_interval = hello['d']['heartbeat_interval']
        logger.info(f"Heartbeat interval: {heartbeat_interval}ms")

        if needs_resume:
            logger.info(f"Intentando RESUME (session_id={session_id_global}, seq={sequence_global})")
            resume_payload = {
                "op": 6,
                "d": {
                    "token": token,
                    "session_id": session_id_global,
                    "seq": sequence_global
                }
            }
            ws.send(json.dumps(resume_payload))
        else:
            auth_data = {
                "op": 2,
                "d": {
                    "token": token,
                    "intents": 0,
                    "properties": {
                        "$os": "Linux",
                        "$browser": "Discord Client",
                        "$device": "Linux"
                    },
                    "presence": {
                        "status": status,
                        "afk": False
                    }
                }
            }
            ws.send(json.dumps(auth_data))
            logger.info("Identificación enviada (op 2)")

        voice_state = {
            "op": 4,
            "d": {
                "guild_id": str(guild_id) if guild_id else None,
                "channel_id": str(channel_id),
                "self_mute": self_mute,
                "self_deaf": self_deaf
            }
        }
        ws.send(json.dumps(voice_state))

        logger.info(f"Conectado al canal {channel_id} (mute={self_mute}, deaf={self_deaf})")
        save_state(channel_id)

        with ws_lock:
            ws_global = ws
        voice_connected.set()

        # FIX: Ahora sí modifica la variable global correctamente
        with heartbeat_ack_lock:
            last_heartbeat_ack_time = time.time()

        # FIX: Señalizar que tenemos un ACK "inicial" para no fallar en el primer ciclo
        heartbeat_ack_received.set()

        stop_heartbeat.clear()
        heartbeat_thread = threading.Thread(target=send_heartbeat, args=(ws, heartbeat_interval, stop_heartbeat))
        heartbeat_thread.start()

        while True:
            try:
                data = ws.recv()
                if data:
                    msg = json.loads(data)
                    op = msg.get('op')
                    seq = msg.get('s')

                    if seq is not None:
                        sequence_global = seq

                    if op == 11:
                        # FIX: Actualizar variable global Y señalizar al hilo de heartbeat
                        with heartbeat_ack_lock:
                            last_heartbeat_ack_time = time.time()
                        heartbeat_ack_received.set()  # FIX: Señalizar ACK recibido
                        logger.debug("Heartbeat ACK recibido")
                        resume_fail_count = 0

                    elif op == 10:
                        logger.debug("Hello recibido (heartbeat configurado)")

                    elif op == 7:
                        # FIX: Discord pide reconexión -> cerrar y reconectar limpiamente
                        logger.warning("Reconnect requerido por Discord (op 7). Cerrando para reconectar...")
                        should_resume.set()
                        disconnect_reason = 'resume'  # Discord nos pidió reconectar, resume válido
                        break  # Salir del loop, el finally cerrará la conexión

                    elif op == 9:
                        invalid_session_resumable = msg.get('d')
                        if invalid_session_resumable:
                            # Sesión inválida pero se puede resumir
                            resume_fail_count += 1
                            if resume_fail_count < max_resume_fails:
                                logger.warning(f"Sesión inválida recuperable (op 9, d=true). Cerrando para RESUME... (intento {resume_fail_count}/{max_resume_fails})")
                                should_resume.set()
                                break
                            else:
                                logger.warning(f"Sesión inválida tras {resume_fail_count} reintentos. Cerrando para nueva identificación...")
                        else:
                            logger.warning("Sesión inválida no recuperable (op 9, d=false). Cerrando para nueva identificación...")

                        # Reset completo, reconectar desde cero
                        should_resume.clear()
                        session_id_global = None
                        sequence_global = None
                        resume_fail_count = 0
                        break  # Salir del loop, reconectar limpiamente

                    elif op == 0:
                        t = msg.get('t', '')
                        if t == 'READY' or t == 'RESUMED':
                            if t == 'RESUMED':
                                logger.info("Sesión reanudada exitosamente")
                                voice_connected.set()
                            else:
                                session_id_global = msg['d'].get('session_id')
                                # FIX: Cachear user_id del evento READY
                                user_data = msg['d'].get('user', {})
                                if user_data.get('id'):
                                    cached_user_id = user_data['id']
                                    logger.info(f"User ID cacheado: {cached_user_id}")
                                logger.info(f"Sesión lista: session_id={session_id_global}")

                        elif t == 'VOICE_STATE_UPDATE':
                            d = msg.get('d', {})
                            # FIX: Usar cached_user_id en vez de llamar a la API cada vez
                            bot_user_id = cached_user_id
                            if not bot_user_id:
                                user_info = get_user_info(TOKEN)
                                if user_info:
                                    cached_user_id = user_info['id']
                                    bot_user_id = cached_user_id

                            if bot_user_id and d.get('user_id') == bot_user_id:
                                current_channel = d.get('channel_id')
                                if current_channel is None:
                                    logger.warning("Bot expulsado del canal. Reintentando unirse inmediatamente...")
                                    kicked_from_channel.set()
                                    voice_connected.clear()
                                    try:
                                        rejoin_payload = {
                                            "op": 4,
                                            "d": {
                                                "guild_id": str(guild_id_global),
                                                "channel_id": str(channel_id_global),
                                                "self_mute": True,
                                                "self_deaf": True
                                            }
                                        }
                                        with ws_lock:
                                            if ws_global:
                                                ws_global.send(json.dumps(rejoin_payload))
                                                logger.info("Reunión inmediata enviada tras expulsión")
                                    except Exception as e:
                                        logger.error(f"Error al reenviar unión inmediata: {e}")
                                else:
                                    if str(current_channel) != str(channel_id_global):
                                        logger.info(f"Bot movido al canal {current_channel}")
                                        channel_id_global = current_channel
                                        save_state(current_channel)
                                    voice_connected.set()

                        elif t == 'VOICE_SERVER_UPDATE':
                            logger.debug("VOICE_SERVER_UPDATE recibido")
                    else:
                        logger.debug(f"Op code recibido: {op}")

            except Exception as e:
                logger.warning(f"Error en receive: {e}")
                disconnect_reason = 'connection_lost'  # FIX: conexión perdida inesperadamente
                break

    except Exception as e:
        logger.error(f"Error de conexión: {e}")
        disconnect_reason = 'connection_error'
    finally:
        logger.info("Cerrando conexión...")
        # FIX: Invalidar sesión solo si fue desconexión inesperada (no op 7 ni op 9 resumable)
        if disconnect_reason in ('connection_lost', 'connection_error'):
            logger.info("Desconexión inesperada - invalidando sesión para fresh identify")
            session_id_global = None
            sequence_global = None
            should_resume.clear()
        stop_heartbeat.set()
        voice_connected.clear()
        if heartbeat_thread and heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=5)
        try:
            ws.close()
        except:
            pass
        with ws_lock:
            if ws_global == ws:
                ws_global = None

def calculate_backoff(attempt):
    delay = RECONNECT_DELAY_BASE * (2 ** attempt)
    jitter = random.uniform(0, delay * 0.5)
    return min(delay + jitter, 120)

def voice_worker():
    # FIX: Declarar TODAS las variables globales
    global ws_global, channel_id_global, session_id_global, sequence_global, cached_user_id

    logger.info("Iniciando worker de voz...")

    # FIX: Reintentar get_user_info en vez de morir al primer fallo
    user_info = None
    for attempt in range(5):
        user_info = get_user_info(TOKEN)
        if user_info:
            break
        wait = 5 * (attempt + 1)
        logger.warning(f"get_user_info falló (intento {attempt+1}/5). Reintentando en {wait}s...")
        time.sleep(wait)

    if user_info:
        cached_user_id = user_info['id']  # FIX: cachear desde el inicio
        logger.info(f"Logged in as {user_info['username']}#{user_info['discriminator']} ({user_info['id']})")
    else:
        logger.error("No se pudo obtener información del usuario tras 5 intentos. Verifica el TOKEN.")
        return

    saved_channel, saved_session, saved_seq = load_state()
    channel_id_global = saved_channel or TARGET_CHANNEL_ID

    # FIX: Ahora sí modifica las variables globales
    if saved_session and saved_seq is not None:
        session_id_global = saved_session
        sequence_global = saved_seq
        should_resume.set()
        logger.info(f"Sesión guardada encontrada. Intentando RESUME al iniciar.")

    running.set()
    kicked_from_channel.clear()
    watchdog_stop.clear()
    mute_deaf_thread = threading.Thread(target=mute_deaf_worker, daemon=True)
    mute_deaf_thread.start()
    watchdog_thread = threading.Thread(target=watchdog_worker, args=(watchdog_stop,), daemon=True)
    watchdog_thread.start()

    reconnect_attempts = 0
    while True:
        try:
            if reconnect_attempts >= MAX_RECONNECT_ATTEMPTS:
                logger.error(f"Máximo de intentos ({MAX_RECONNECT_ATTEMPTS}) alcanzado. Esperando 60s antes de reiniciar ciclo...")
                time.sleep(60)
                reconnect_attempts = 0
                should_resume.clear()
                session_id_global = None
                sequence_global = None

            canal_actual = channel_id_global
            logger.info(f"Conectando al canal {canal_actual}... (intento {reconnect_attempts + 1}/{MAX_RECONNECT_ATTEMPTS})")
            run_voice_connection(TOKEN, canal_actual, GUILD_ID, STATUS, SELF_MUTE, SELF_DEAF, reconnect_attempts)

            delay = calculate_backoff(reconnect_attempts)
            logger.info(f"Desconectado. Reintentando en {delay:.1f} segundos... (backoff exponencial)")
            time.sleep(delay)
            reconnect_attempts += 1

        except Exception as e:
            logger.error(f"Error en conexión: {e}")
            with ws_lock:
                ws_global = None
            delay = calculate_backoff(reconnect_attempts)
            time.sleep(delay)
            reconnect_attempts += 1

async def health_check(request):
    is_connected = voice_connected.is_set()
    status = "OK" if is_connected else "DEGRADED"
    return web.Response(text=f'{status} - voice_connected={is_connected}', status=200 if is_connected else 503)

async def start_web_server():
    app = web.Application()
    app.router.add_get('/health', health_check)
    app.router.add_get('/', health_check)

    port = int(os.environ.get('PORT', 10000))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logger.info(f"Servidor web iniciado en puerto {port}")

async def main_async():
    if not TOKEN:
        logger.error("No se encontró la variable de entorno TOKEN")
        return

    logger.info("Iniciando bot...")
    logger.info(f"Canal objetivo: {TARGET_CHANNEL_ID}")

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, voice_worker)

    await start_web_server()

    while True:
        await asyncio.sleep(3600)

def main():
    asyncio.run(main_async())

if __name__ == '__main__':
    main()
