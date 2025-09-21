import requests
import time
from datetime import datetime
import smtplib
from email.mime.text import MIMEText

EMAIL_USER = 'zonapluschannel@gmail.com'
EMAIL_PASS = 'exquwsyqxxkycoqo'
EMAIL_TO = 'maykers@gmail.com'

precio_anterior = {}
resultados = []
last_revision = ""

current_config = {
    "umbral": 5.0,
    "interval": "5m"
}

_cached_prices = None
_last_fetch_time = 0

_cached_data = None
_last_data_fetch = 0

def set_config(umbral, interval):
    current_config["umbral"] = float(umbral)
    if interval in ["1m", "3m"]:
        interval = "5m"  # Forzar mínimo 5m
    current_config["interval"] = interval

def enviar_alerta(subject, body, price, change):
    # Determina el color según si es subida o caída
    if change > 0:
        action_text = f"<strong>HA SUBIDO FUERTE</strong> {round(change, 2)}%"  # Subida en verde
        color = 'green'
        symbol_img = '🟢'  # Símbolo verde
    else:
        action_text = f"<strong>HA BAJADO FUERTE</strong> {round(change, 2)}%"  # Caída en rojo
        color = 'red'
        symbol_img = '🔴'  # Símbolo rojo

    # Añadir el icono al asunto del correo
    subject_with_icon = f"{symbol_img} {subject}"

    # Cuerpo del mensaje con el formato actualizado
    body = f"""
    <span style="color:{color};">
        {symbol_img} {subject} {action_text} desde el último chequeo.
    </span>
    <br><br>
    Precio: <strong style="color:{color};">{price}</strong>
    <br>
    Hora de alerta: <span style="color:{color};"><strong>{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</strong></span>
    """

    # Creación del mensaje en formato HTML
    msg = MIMEText(body, 'html')  # Se envía como HTML para soportar etiquetas de estilo
    msg['Subject'] = subject_with_icon  # Se añade el icono en el asunto
    msg['From'] = 'Bot de Trading'
    msg['To'] = EMAIL_TO

    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, EMAIL_TO, msg.as_string())
    except Exception as e:
        print("Error al enviar correo:", e)

def get_cached_top10():
    global _cached_prices, _last_fetch_time
    now = time.time()
    if _cached_prices and now - _last_fetch_time < 60:
        return _cached_prices
    try:
        headers = {"User-Agent": "MyCryptoBot/1.0"}
        url = "https://api.binance.com/api/v3/ticker/24hr"
        res = requests.get(url, headers=headers)
        data = res.json()
        usdt_pairs = [d for d in data if d["symbol"].endswith("USDT")]
        top = sorted(usdt_pairs, key=lambda x: float(x["priceChangePercent"]), reverse=True)[:10]
        _cached_prices = [(p["symbol"], float(p["lastPrice"])) for p in top]
        _last_fetch_time = now
    except:
        _cached_prices = []
    return _cached_prices

def get_top10_data_cached(umbral=None):
    global resultados, last_revision, _cached_data, _last_data_fetch
    now = time.time()
    if _cached_data and now - _last_data_fetch < 60:
        return _cached_data

    if umbral is None:
        umbral = current_config["umbral"]

    top = get_cached_top10()
    temp = []
    for symbol, price in top:
        prev = precio_anterior.get(symbol)
        if prev:
            change = ((price - prev) / prev) * 100
            estado = "estable"
            if change >= umbral:
                estado = "subida"
                enviar_alerta(
                    f"{symbol} +{round(change, 2)}%",
                    f"{symbol} subió +{round(change, 2)}% desde el último chequeo.",
                    price, change
                )
            elif change <= -umbral:
                estado = "caida"
                enviar_alerta(
                    f"{symbol} {round(change, 2)}%",
                    f"{symbol} cayó {round(change, 2)}% desde el último chequeo.",
                    price, change
                )
            temp.append({
                "symbol": symbol,
                "price": round(price, 6),
                "change": round(change, 2),
                "porcentaje": round(change, 2),
                "status": estado,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
        else:
            temp.append({
                "symbol": symbol,
                "price": round(price, 6),
                "change": None,
                "porcentaje": 0,
                "status": "monitoreando",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
        precio_anterior[symbol] = price
    resultados = temp
    last_revision = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _cached_data = temp
    _last_data_fetch = now
    return resultados

def get_klines(symbol, interval, start_time=None):
    import time
    import requests

    endpoint = "https://api.binance.com/api/v3/klines"
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": 1000
    }

    if start_time:
        params["startTime"] = start_time

    response = requests.get(endpoint, params=params)
    data = response.json()
    
    # Estandarizamos a objetos con claves: t = timestamp, p = precio medio
    parsed = [{"t": k[0], "p": (float(k[2]) + float(k[3])) / 2} for k in data]
    return parsed

def get_live_prices():
    try:
        top = get_cached_top10()
        top_symbols = [symbol for symbol, _ in top]
        headers = {"User-Agent": "MyCryptoBot/1.0"}
        url = "https://api.binance.com/api/v3/ticker/price"
        res = requests.get(url, headers=headers)
        data = res.json()
        filtered = [d for d in data if d["symbol"] in top_symbols]
        return [{"symbol": d["symbol"], "price": float(d["price"])} for d in filtered]
    except Exception as e:
        print("Error al obtener precios en vivo:", e)
        return []
