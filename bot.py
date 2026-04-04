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

RECONNECT_DELAY = 5
MAX_RECONNECT_ATTEMPTS = 10

MUTE_CHANGE_MIN = 300
MUTE_CHANGE_MAX = 600

ws_global = None
channel_id_global = None
guild_id_global = None
running = threading.Event()

def load_state():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                return json.load(f).get('channel_id')
        except Exception as e:
            logger.error(f"Error al cargar estado: {e}")
    return None

def save_state(channel_id):
    try:
        with open(DATA_FILE, 'w') as f:
            json.dump({'channel_id': channel_id}, f)
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
    while not stop_event.is_set():
        try:
            time.sleep(heartbeat_interval / 1000)
            ws.send(json.dumps({"op": 1, "d": None}))
            logger.debug("Heartbeat enviado")
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
    ws.send(json.dumps(voice_state))
    logger.info(f"Estado de voz actualizado: mute={mute}, deaf={deaf}")

def mute_deaf_worker():
    while running.is_set():
        try:
            time.sleep(random.randint(MUTE_CHANGE_MIN, MUTE_CHANGE_MAX))
            
            if ws_global and ws_global.sock and ws_global.sock.connected:
                current_mute = random.choice([True, False])
                current_deaf = random.choice([True, False])
                
                update_voice_state(ws_global, channel_id_global, guild_id_global, current_mute, current_deaf)
            else:
                logger.debug("WebSocket no conectado, saltando cambio de mute/deaf")
                
        except Exception as e:
            logger.warning(f"Error en worker de mute/deaf: {e}")

def run_voice_connection(token, channel_id, guild_id, status, self_mute, self_deaf, reconnect_attempts=0):
    global ws_global, channel_id_global, guild_id_global
    
    ws = ws_client.WebSocket()
    gateway_url = 'wss://gateway.discord.gg/?v=9&encoding=json'
    stop_heartbeat = threading.Event()
    heartbeat_thread = None
    
    channel_id_global = channel_id
    guild_id_global = guild_id
    
    try:
        logger.info(f"Conectando al gateway de Discord...")
        ws.connect(gateway_url)
        start = json.loads(ws.recv())
        heartbeat_interval = start['d']['heartbeat_interval']
        logger.info(f"Heartbeat interval: {heartbeat_interval}ms")
        
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
            },
            "s": None,
            "t": None
        }
        
        voice_state = {
            "op": 4,
            "d": {
                "guild_id": str(guild_id) if guild_id else None,
                "channel_id": str(channel_id),
                "self_mute": self_mute,
                "self_deaf": self_deaf
            }
        }
        
        ws.send(json.dumps(auth_data))
        ws.send(json.dumps(voice_state))
        
        logger.info(f"Conectado al canal {channel_id} (mute={self_mute}, deaf={self_deaf})")
        save_state(channel_id)
        
        ws_global = ws
        
        stop_heartbeat.clear()
        heartbeat_thread = threading.Thread(target=send_heartbeat, args=(ws, heartbeat_interval, stop_heartbeat))
        heartbeat_thread.start()
        
        while True:
            try:
                data = ws.recv()
                if data:
                    msg = json.loads(data)
                    op = msg.get('op')
                    
                    if op == 11:
                        logger.debug("Heartbeat ACK recibido")
                    elif op == 7:
                        logger.warning("Reconnect requerido por Discord")
                        break
                    elif op == 9:
                        logger.warning(f"Desconexión: {msg.get('d')}")
                        break
                    elif op == 0:
                        t = msg.get('t', '')
                        if t == 'VOICE_STATE_UPDATE' or t == 'VOICE_SERVER_UPDATE':
                            logger.info(f"Evento de voz recibido: {t}")
                    else:
                        logger.debug(f"Op code: {op}")
                        
            except Exception as e:
                logger.warning(f"Error en receive: {e}")
                break
                
    except Exception as e:
        logger.error(f"Error de conexión: {e}")
    finally:
        logger.info("Cerrando conexión...")
        stop_heartbeat.set()
        if heartbeat_thread and heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=2)
        try:
            ws.close()
        except:
            pass

def voice_worker():
    global ws_global
    
    logger.info("Iniciando worker de voz...")
    
    user_info = get_user_info(TOKEN)
    if user_info:
        logger.info(f"Logged in as {user_info['username']}#{user_info['discriminator']} ({user_info['id']})")
    else:
        logger.error("No se pudo obtener información del usuario")
        return
    
    channel_id = TARGET_CHANNEL_ID
    
    running.set()
    mute_deaf_thread = threading.Thread(target=mute_deaf_worker, daemon=True)
    mute_deaf_thread.start()
    
    while True:
        reconnect_attempts = 0
        while reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
            try:
                logger.info(f"Conectando al canal {channel_id}... (intento {reconnect_attempts + 1}/{MAX_RECONNECT_ATTEMPTS})")
                run_voice_connection(TOKEN, channel_id, GUILD_ID, STATUS, SELF_MUTE, SELF_DEAF, reconnect_attempts)
                
                ws_global = None
                
                delay = RECONNECT_DELAY * (reconnect_attempts + 1)
                logger.info(f"Desconectado. Reintentando en {delay} segundos...")
                time.sleep(delay)
                reconnect_attempts += 1
                
            except Exception as e:
                logger.error(f"Error en conexión: {e}")
                ws_global = None
                time.sleep(5)
                reconnect_attempts += 1
        
        logger.error(f"Máximo de intentos ({MAX_RECONNECT_ATTEMPTS}) alcanzado. Esperando 60s antes de reiniciar...")
        time.sleep(60)
        reconnect_attempts = 0

async def health_check(request):
    return web.Response(text='OK')

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