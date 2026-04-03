import json
import os
import time
import logging
import asyncio
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
CHANNEL_ID = os.environ.get('CHANNEL_ID', '1374565606967214100')
STATUS = os.environ.get('STATUS', 'online')
SELF_MUTE = os.environ.get('SELF_MUTE', 'true').lower() == 'true'
SELF_DEAF = os.environ.get('SELF_DEAF', 'true').lower() == 'true'

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

def run_voice_connection(token, channel_id, guild_id, status, self_mute, self_deaf, reconnect_attempts=0):
    ws = ws_client.WebSocket()
    gateway_url = 'wss://gateway.discord.gg/?v=9&encoding=json'
    
    try:
        ws.connect(gateway_url)
        start = json.loads(ws.recv())
        heartbeat_interval = start['d']['heartbeat_interval']
        
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
        
        time.sleep(heartbeat_interval / 1000)
        ws.send(json.dumps({"op": 1, "d": None}))
        
        while True:
            try:
                data = ws.recv()
                if data:
                    msg = json.loads(data)
                    if msg.get('op') == 11:
                        time.sleep(heartbeat_interval / 1000)
                        ws.send(json.dumps({"op": 1, "d": None}))
            except Exception as e:
                logger.warning(f"Error en conexión: {e}")
                break
                
    except Exception as e:
        logger.error(f"Error de conexión: {e}")
    finally:
        try:
            ws.close()
        except:
            pass
    
    if reconnect_attempts < 5:
        delay = 5 * (reconnect_attempts + 1)
        logger.info(f"Reconectando en {delay} segundos... (intento {reconnect_attempts + 1}/5)")
        time.sleep(delay)
        run_voice_connection(token, channel_id, guild_id, status, self_mute, self_deaf, reconnect_attempts + 1)
    else:
        logger.error("Máximo de intentos de reconexión alcanzado")

def voice_worker():
    logger.info("Iniciando worker de voz...")
    current_channel = CHANNEL_ID
    
    user_info = get_user_info(TOKEN)
    if user_info:
        logger.info(f"Logged in as {user_info['username']}#{user_info['discriminator']} ({user_info['id']})")
    else:
        logger.error("No se pudo obtener información del usuario")
        return
    
    while True:
        try:
            run_voice_connection(TOKEN, current_channel, GUILD_ID, STATUS, SELF_MUTE, SELF_DEAF)
        except Exception as e:
            logger.error(f"Error en worker: {e}")
            time.sleep(5)

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
    
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, voice_worker)
    
    await start_web_server()
    
    while True:
        await asyncio.sleep(3600)

def main():
    asyncio.run(main_async())

if __name__ == '__main__':
    main()
