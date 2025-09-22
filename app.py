from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# 🔧 CONFIGURA TUS CREDENCIALES AQUÍ
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:@localhost/alertas_bot'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# 📦 MODELO DE ALERTA
class Alerta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(20))
    timestamp = db.Column(db.String(100))
    price = db.Column(db.Float)
    estado = db.Column(db.String(20))
    porcentaje = db.Column(db.Float)
    objetivo = db.Column(db.Float)
    entrada = db.Column(db.Float)
    alcanzo_entrada = db.Column(db.Boolean)
    bloqueada = db.Column(db.Boolean)

    def to_dict(self):
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "price": self.price,
            "estado": self.estado,
            "porcentaje": self.porcentaje,
            "objetivo": self.objetivo,
            "entrada": self.entrada,
            "alcanzoEntrada": self.alcanzo_entrada,
            "bloqueada": self.bloqueada
        }

# ⚙️ API EXISTENTE
from binance_bot import get_top10_data_cached, get_klines, get_live_prices, set_config

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data")
def data():
    umbral = float(request.args.get("umbral", 5))
    interval = request.args.get("interval", "5m")
    set_config(umbral, interval)
    return jsonify(get_top10_data_cached(umbral=umbral))

@app.route("/api/klines")
def klines():
    symbol = request.args.get("symbol")
    interval = request.args.get("interval", "5m")
    return jsonify(get_klines(symbol, interval))

@app.route("/api/live")
def live_prices():
    return jsonify(get_live_prices())

# 🚀 RUTA PARA CREAR LA BASE DE DATOS (solo ejecutar una vez)
@app.route("/init-db")
def init_db():
    db.create_all()
    return "Base de datos creada correctamente."

# 🧠 AQUI AGREGAREMOS MÁS RUTAS EN EL PRÓXIMO PASO


@app.route("/api/alertas", methods=["POST"])
def guardar_alerta():
    data = request.json
    nueva = Alerta(
        symbol=data["symbol"],
        timestamp=data["timestamp"],
        price=data["price"],
        estado=data["estado"],
        porcentaje=data["porcentaje"],
        objetivo=data["objetivo"],
        entrada=data["entrada"],
        alcanzo_entrada=data["alcanzoEntrada"],
        bloqueada=data["bloqueada"]
    )
    db.session.add(nueva)
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/alertas", methods=["GET"])
def obtener_alertas():
    alertas = Alerta.query.order_by(Alerta.timestamp.desc()).all()
    return jsonify([a.to_dict() for a in alertas])

@app.route("/api/alertas/eliminar", methods=["POST"])
def eliminar_alertas():
    datos = request.json  # Espera: lista de {symbol, timestamp}
    eliminadas = 0
    for alerta in datos:
        a = Alerta.query.filter_by(symbol=alerta["symbol"], timestamp=alerta["timestamp"]).first()
        if a:
            db.session.delete(a)
            eliminadas += 1
    db.session.commit()
    return jsonify({"ok": True, "eliminadas": eliminadas})

if __name__ == "__main__":
    app.run(debug=True)

