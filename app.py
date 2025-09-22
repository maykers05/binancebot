from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc
from datetime import datetime
from threading import Thread
import time

# Estado global del bot
bot_activo = False


app = Flask(__name__)

# Configuración de la base de datos MySQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///alertas_bot.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ------------------ MODELOS ------------------

class Alerta(db.Model):
    __tablename__ = 'alertas'
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
            "id": self.id,
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

class HistorialCompleto(db.Model):
    __tablename__ = 'historial_completo'
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
            "id": self.id,
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

class HorarioBot(db.Model):
    __tablename__ = 'horarios_bot'
    id = db.Column(db.Integer, primary_key=True)
    dias = db.Column(db.String(50))
    hora_inicio = db.Column(db.Time)
    hora_fin = db.Column(db.Time)
    fecha_inicio = db.Column(db.Date)
    fecha_fin = db.Column(db.Date)

    def to_dict(self):
        return {
            "id": self.id,
            "dias": list(map(int, self.dias.split(","))) if self.dias else [],
            "inicio": self.hora_inicio.strftime("%H:%M"),
            "fin": self.hora_fin.strftime("%H:%M"),
            "fecha_inicio": self.fecha_inicio.strftime("%Y-%m-%d") if self.fecha_inicio else None,
            "fecha_fin": self.fecha_fin.strftime("%Y-%m-%d") if self.fecha_fin else None
        }




# ------------------ API EXISTENTE ------------------

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

# ------------------ ALERTAS ------------------

@app.route("/api/alertas", methods=["GET", "POST"])
def alertas():
    if request.method == "POST":
        data = request.json
        if not data:
            return jsonify({"ok": False, "error": "Datos vacíos"}), 400

        alerta = Alerta(
            symbol=data["symbol"],
            timestamp=data["timestamp"],
            price=data["price"],
            estado=data["estado"],
            porcentaje=data["porcentaje"],
            objetivo=data["objetivo"],
            entrada=data["entrada"],
            alcanzo_entrada=data.get("alcanzoEntrada", False),
            bloqueada=data.get("bloqueada", False)
        )
        db.session.add(alerta)

        historial = HistorialCompleto(
            symbol=data["symbol"],
            timestamp=data["timestamp"],
            price=data["price"],
            estado=data["estado"],
            porcentaje=data["porcentaje"],
            objetivo=data["objetivo"],
            entrada=data["entrada"],
            alcanzo_entrada=data.get("alcanzoEntrada", False),
            bloqueada=data.get("bloqueada", False)
        )
        db.session.add(historial)

        db.session.commit()



        total_alertas = Alerta.query.count()
        if total_alertas > 25:
            excedente = total_alertas - 25
            antiguas = Alerta.query.order_by(Alerta.id.asc()).limit(excedente).all()
            for a in antiguas:
                db.session.delete(a)
            db.session.commit()

        return jsonify({"ok": True})

    else:
        alertas = Alerta.query.order_by(desc(Alerta.id)).all()
        return jsonify([a.to_dict() for a in alertas])



@app.route("/api/alertas/eliminar", methods=["POST"])
def eliminar_alertas():
    datos = request.json
    eliminadas = 0
    for d in datos:
        eliminadas += Alerta.query.filter_by(symbol=d["symbol"], timestamp=d["timestamp"]).delete()
    db.session.commit()
    return jsonify({"ok": True, "eliminadas": eliminadas})

@app.route("/api/alertas/update_estado", methods=["POST"])
def update_estado():
    data = request.json
    symbol = data.get("symbol")
    timestamp = data.get("timestamp")
    nuevo_estado = data.get("estado")
    bloqueada = data.get("bloqueada")
    alcanzo_entrada = data.get("alcanzoEntrada")

    if not symbol or not timestamp:
        return jsonify({"ok": False, "error": "Faltan datos"}), 400

    for model in (Alerta, HistorialCompleto):
        alerta = model.query.filter_by(symbol=symbol, timestamp=timestamp).first()
        if alerta:
            alerta.estado = nuevo_estado
            alerta.bloqueada = bloqueada
            alerta.alcanzo_entrada = alcanzo_entrada

    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/alertas/bloquear", methods=["POST"])
def bloquear_alerta():
    data = request.get_json()
    symbol = data.get("symbol")
    timestamp = data.get("timestamp")

    if not symbol or not timestamp:
        return jsonify({"ok": False, "error": "Datos incompletos"}), 400

    for model in (Alerta, HistorialCompleto):
        alerta = model.query.filter_by(symbol=symbol, timestamp=timestamp).first()
        if alerta:
            alerta.bloqueada = True

    db.session.commit()
    return jsonify({"ok": True})

# ------------------ HISTORIAL COMPLETO ------------------

@app.route("/api/historial_completo")
def historial_completo():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("limit", 30))
    paginacion = HistorialCompleto.query.order_by(desc(HistorialCompleto.id)).paginate(page=page, per_page=per_page, error_out=False)
    datos = [a.to_dict() for a in paginacion.items]
    return jsonify({
        "total": paginacion.total,
        "page": page,
        "pages": paginacion.pages,
        "alertas": datos
    })

@app.route("/api/historial_completo/eliminar", methods=["POST"])
def eliminar_historial_completo():
    try:
        datos = request.json
        eliminadas = 0
        for d in datos:
            symbol = d.get("symbol")
            timestamp = d.get("timestamp")
            if symbol and timestamp:
                eliminadas += HistorialCompleto.query.filter_by(symbol=symbol, timestamp=timestamp).delete()
        db.session.commit()
        return jsonify({"ok": True, "eliminadas": eliminadas})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": str(e)}), 500

# ------------------ HORARIOS DEL BOT ------------------

@app.route("/api/horarios", methods=["GET"])
def obtener_horarios():
    horarios = HorarioBot.query.all()
    return jsonify([h.to_dict() for h in horarios])


from datetime import datetime

@app.route("/api/horarios", methods=["POST"])
def guardar_horario():
    data = request.json
    dias = data.get("dias", [])
    inicio = data.get("inicio")
    fin = data.get("fin")
    fecha_inicio = data.get("fecha_inicio")
    fecha_fin = data.get("fecha_fin")

    if not inicio or not fin or not fecha_inicio or not fecha_fin:
        return jsonify({"error": "Datos incompletos"}), 400

    try:
        hora_inicio_obj = datetime.strptime(inicio, "%H:%M").time()
        hora_fin_obj = datetime.strptime(fin, "%H:%M").time()
        fecha_inicio_obj = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
        fecha_fin_obj = datetime.strptime(fecha_fin, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Formato de fecha/hora inválido"}), 400

    nuevo = HorarioBot(
        dias=",".join(map(str, dias)),
        hora_inicio=hora_inicio_obj,
        hora_fin=hora_fin_obj,
        fecha_inicio=fecha_inicio_obj,
        fecha_fin=fecha_fin_obj
    )
    db.session.add(nuevo)
    db.session.commit()
    return jsonify({"ok": True})



@app.route("/api/horarios/<int:horario_id>", methods=["DELETE"])
def eliminar_horario(horario_id):
    horario = HorarioBot.query.get(horario_id)
    if not horario:
        return jsonify({"ok": False, "error": "Horario no encontrado"}), 404

    db.session.delete(horario)
    db.session.commit()
    return jsonify({"ok": True})



@app.route("/api/bot/estado")
def estado_bot():
    return jsonify({"activo": bot_activo})

# ------------------ MAIN ------------------

def verificar_horario_bot():
    global bot_activo
    with app.app_context():
        while True:
            now = datetime.now()
            dia_actual = now.isoweekday()
            hora_actual = now.time()
            fecha_actual = now.date()

            con_horario = HorarioBot.query.all()
            activo = False

            for h in con_horario:
                dias = list(map(int, h.dias.split(",")))
                if (
                    dia_actual in dias and
                    h.hora_inicio <= hora_actual <= h.hora_fin and
                    h.fecha_inicio <= fecha_actual <= h.fecha_fin
                ):
                    activo = True
                    break

            if activo != bot_activo:
                bot_activo = activo
                print(f"[BOT] Estado cambiado: {'ACTIVO' if bot_activo else 'INACTIVO'}")

            time.sleep(60)





if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        # Lanzar hilo para verificación de horarios
        t = Thread(target=verificar_horario_bot)
        t.daemon = True
        t.start()

    app.run(debug=True)

