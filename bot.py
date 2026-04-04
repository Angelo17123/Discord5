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
    headers = {"Authorization": token, "Content-Type": "application/json"}
    resp = requests.get('https://discord.com/api/v9/users/@me', headers=headers)
    if resp.status_code == 200:
        return resp.json()
    return None

def send_heartbeat(ws, heartbeat_interval, stop_event):
    last_ack_time = time.time()
    consecutive_missed_acks = 0

    while not stop_event.is_set():
        try:
            time.sleep(heartbeat_interval / 1000)

            if stop_event.is_set():
                break

            now = time.time()
            time_since_last_ack = now - last_ack_time
            timeout_threshold = (heartbeat_interval / 1000) * HEARTBEAT_ACK_TIMEOUT_MULTIPLIER

            if time_since_last_ack > timeout_threshold and consecutive_missed_acks > 0:
                logger.warning(f"Heartbeat ACK perdido ({consecutive_missed_acks} consecutivos). Reconectando...")
                break

            ws.send(json.dumps({"op": 1, "d": sequence_global}))
            logger.debug("Heartbeat enviado")
            consecutive_missed_acks += 1

        except Exception as e:
            logger.warning(f"Error enviando heartbeat: {e}")
            break

def reset_heartbeat_acks():
    pass

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
                                "channel_id": str(TARGET_CHANNEL_ID),
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
                expected_channel = str(TARGET_CHANNEL_ID)

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

def run_voice_connection(token, channel_id, guild_id, status, self_mute, self_deaf, reconnect_attempts=0):
    global ws_global, channel_id_global, guild_id_global, session_id_global, sequence_global

    ws = ws_client.WebSocket()
    gateway_url = 'wss://gateway.discord.gg/?v=9&encoding=json'
    stop_heartbeat = threading.Event()
    heartbeat_thread = None
    needs_resume = should_resume.is_set() and session_id_global and sequence_global is not None

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
                    "properties": {
                        "$os": "Windows 10",
                        "$browser": "Google Chrome",
                        "$device": "Windows"
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
                        logger.debug("Heartbeat ACK recibido")
                    elif op == 10:
                        logger.debug("Hello recibido (heartbeat configurado)")
                    elif op == 7:
                        logger.warning("Reconnect requerido por Discord")
                        should_resume.set()
                        break
                    elif op == 9:
                        invalid_session_data = msg.get('d')
                        if invalid_session_data:
                            logger.warning("Sesión inválida no recuperable (op 9, d=true). Reidentificando...")
                            should_resume.clear()
                            session_id_global = None
                            sequence_global = None
                        else:
                            logger.warning("Sesión inválida recuperable (op 9, d=false). Reanudando...")
                            should_resume.set()
                        break
                    elif op == 0:
                        t = msg.get('t', '')
                        if t == 'READY' or t == 'RESUMED':
                            if t == 'RESUMED':
                                logger.info("Sesión reanudada exitosamente")
                                voice_connected.set()
                            else:
                                session_id_global = msg['d'].get('session_id')
                                logger.info(f"Sesión lista: session_id={session_id_global}")
                        elif t == 'VOICE_STATE_UPDATE':
                            d = msg.get('d', {})
                            user_info = get_user_info(TOKEN)
                            if user_info and d.get('user_id') == user_info['id']:
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
                                                "channel_id": str(TARGET_CHANNEL_ID),
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
                break

    except Exception as e:
        logger.error(f"Error de conexión: {e}")
    finally:
        logger.info("Cerrando conexión...")
        stop_heartbeat.set()
        voice_connected.clear()
        if heartbeat_thread and heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=2)
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
    global ws_global

    logger.info("Iniciando worker de voz...")

    user_info = get_user_info(TOKEN)
    if user_info:
        logger.info(f"Logged in as {user_info['username']}#{user_info['discriminator']} ({user_info['id']})")
    else:
        logger.error("No se pudo obtener información del usuario")
        return

    saved_channel, saved_session, saved_seq = load_state()
    channel_id = saved_channel or TARGET_CHANNEL_ID

    if saved_session and saved_seq is not None:
        session_id_global = saved_session
        sequence_global = saved_seq
        should_resume.set()
        logger.info(f"Sesión guardada encontrada. Intentando RESUME al iniciar.")

    running.set()
    kicked_from_channel.clear()
    mute_deaf_thread = threading.Thread(target=mute_deaf_worker, daemon=True)
    mute_deaf_thread.start()

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

            logger.info(f"Conectando al canal {channel_id}... (intento {reconnect_attempts + 1}/{MAX_RECONNECT_ATTEMPTS})")
            run_voice_connection(TOKEN, channel_id, GUILD_ID, STATUS, SELF_MUTE, SELF_DEAF, reconnect_attempts)

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
