// Parámetros configurables (valores por defecto)
let paramRetrocesoSubida = 1;
let paramSubida = 1.5;
let paramBajada = 1.5;

let updateTimer = null;

let botActivo = false;
let intervaloAuto = null;

function toggleBot(estadoManual = null) {
  const toggle = document.getElementById("bot-toggle");
  botActivo = estadoManual !== null ? estadoManual : toggle.checked;

  const grid = document.getElementById("crypto-grid");
  const alertTable = document.querySelector(".overflow-auto");
  const lastUpdate = document.getElementById("last-update");

const estadoBotEl = document.getElementById("estado-bot");

if (!botActivo) {
  clearInterval(updateTimer);
  grid.classList.add("bot-desactivado");
  alertTable.classList.add("bot-desactivado");

  estadoBotEl.textContent = "⛔ Bot desactivado";
  estadoBotEl.classList.remove("text-green-400");
  estadoBotEl.classList.add("text-yellow-400");

} else {
  grid.classList.remove("bot-desactivado");
  alertTable.classList.remove("bot-desactivado");

  estadoBotEl.textContent = "✅ Bot activado";
  estadoBotEl.classList.remove("text-yellow-400");
  estadoBotEl.classList.add("text-green-400");

  cargarAlertasDesdeServidor();
  fetchData();
  startAutoUpdate();
}
}


function parseIntervalToMs(str) {
  const regex = /^(\d+)([smh])$/i;
  const match = str.match(regex);
  if (!match) return 60000;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return 60000;
  }
}

function getDecimalesDinamicos(precio) {
  if (precio >= 1000) return 2;
  if (precio >= 1) return 3;
  if (precio >= 0.01) return 4;
  if (precio >= 0.0001) return 6;
  return 8;
}


async function fetchData() {
  if (!botActivo) return; // 🚫 No hacer nada si está apagado
  const umbral = parseFloat(document.getElementById("umbral").value) || 5;
  const interval = document.getElementById("interval").value || "5m";

  const res = await fetch(`/api/data?umbral=${umbral}&interval=${interval}`);
  const data = await res.json();

  const grid = document.getElementById("crypto-grid");
  const timeEl = document.getElementById("last-update");
  grid.innerHTML = "";
  const audio = new Audio('/static/alert.wav');

  data.forEach(item => {
    const card = document.createElement("div");
    let bgColor = 'bg-gray-800';
    let shouldAlert = false;

    if (item.change >= umbral) {
      bgColor = 'bg-green-600';
      shouldAlert = true;
    } else if (item.change <= -umbral) {
      bgColor = 'bg-red-600';
      shouldAlert = true;
    }

    if (shouldAlert) {
      try {
        audio.play();
      } catch (e) {}
    }

    card.className = `neon-card p-4 rounded-xl text-white ${bgColor}`;

    const statusClass = item.status === 'subida' ? 'status-up' :
                        item.status === 'caida' ? 'status-down' :
                        item.status === 'estable' ? 'status-neutral' : 'monitoreando';

    const label = item.change >= umbral
      ? 'SUBIDA FUERTE'
      : item.change <= -umbral
      ? 'CAÍDA FUERTE'
      : item.status.toUpperCase();

const colorClass = item.change >= umbral ? 'text-green-300'
                 : item.change <= -umbral ? 'text-red-900'
                 : 'text-gray-300';

card.innerHTML = `
  <div class="flex justify-between items-center mb-2">
    <div>
      <h2 class="text-lg font-bold text-cyan-300">${item.symbol}</h2>
      <p class="text-sm text-green-300 font-semibold" id="price-${item.symbol}">Precio: $${item.price}</p>
      <p class="text-sm text-gray-300">${item.timestamp}</p>
    </div>
    <div class="text-right">
      <p class="text-md font-semibold ${colorClass}">${item.change !== null ? item.change + '%' : '—'}</p>
      <p class="text-sm font-bold">${label}</p>
    </div>
  </div>
  <canvas id="chart-${item.symbol}" height="100"></canvas>
`;

    grid.appendChild(card);
    drawChart(`chart-${item.symbol}`, item.symbol);

    if (shouldAlert) {
      const symbol = item.symbol;
      const timestamp = item.timestamp;
      const price = item.price;
      const estado = item.change >= umbral ? "SUBIDA" : "BAJADA";
      const porcentaje = item.change.toFixed(2);

      const objetivo = estado === "BAJADA"
        ? price * (1 + paramBajada / 100)
        : price * (1 - paramRetrocesoSubida / 100) * (1 + paramSubida / 100);

      const entrada = estado === "SUBIDA"
        ? price * (1 - paramRetrocesoSubida / 100)
        : price;

      const tbody = document.getElementById("alert-table-body");
      const tr = document.createElement("tr");
      tr.dataset.symbol = symbol;
      tr.dataset.fecha = timestamp;
      tr.dataset.estado = estado;
      tr.dataset.precio = price;
      tr.dataset.objetivo = objetivo;
      tr.dataset.entrada = entrada;
      tr.dataset.alcanzoEntrada = "false";
      tr.dataset.bloqueada = "false";  // NUEVO

const decimales = getDecimalesDinamicos(price);
const colorPrecio = estado === "SUBIDA" ? "text-green-300" : "text-red-400";

tr.innerHTML = `
  <td class="py-1 px-4">🔔 ${timestamp}</td>
  <td class="py-1 px-4 font-bold text-cyan-400">${symbol}</td>
  <td class="py-1 px-2 text-cyan-300 cursor-pointer text-xl"
    onclick="expandirGrafico('${symbol}', ${price}, ${objetivo}, ${entrada}, '${estado}')">📊</td>
  <td class="py-1 px-4 ${colorPrecio}">
    $${price.toFixed(decimales)}
    <span class="ml-2 cursor-pointer text-cyan-300 hover:text-white text-lg"
      onclick="mostrarDetallesAlerta(this, '${estado}', ${price}, ${entrada}, ${objetivo})">ℹ️</span>
  </td>
  <td class="py-1 px-4 ${estado === 'SUBIDA' ? 'status-up' : 'status-down'}">${estado} +${porcentaje}%</td>
  <td class="py-1 px-4" data-resultado>
  <span class="${estado === 'SUBIDA' ? 'result-esperando' : 'result-parcial-perdedora'}">
    ${estado === 'SUBIDA' ? 'ESPERANDO ENTRADA' : 'PARCIALMENTE PERDEDORA'}
  </span>
</td>

  <td class="py-1 px-4 text-center"><input type="checkbox" class="select-alert"></td>
`;


      tbody.prepend(tr);
      guardarAlertaEnServidor({
        symbol: symbol,
        timestamp: timestamp,
        price: price,
        estado: estado,
        porcentaje: porcentaje,
        objetivo: objetivo,
        entrada: entrada,
        alcanzoEntrada: false,
        bloqueada: false
      });

    }
  });

  const liveRes = await fetch("/api/live");
  const liveData = await liveRes.json();
  liveData.forEach(item => {
    const el = document.getElementById(`price-${item.symbol}`);
    const dec = getDecimalesDinamicos(item.price);
    if (el) el.textContent = `Precio: $${item.price.toFixed(dec)}`;
  });

  revisarResultados(liveData);

  if (data.length > 0) {
    timeEl.textContent = "Última revisión: " + data[0].timestamp;
  }
}

async function drawChart(id, symbol) {
  const interval = document.getElementById('interval').value;
  const res = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}`);
  const data = await res.json();
  const ctx = document.getElementById(id).getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => new Date(d.t).toLocaleTimeString()),
      datasets: [{
        label: symbol,
        data: data.map(d => d.p),
        borderColor: '#36eaff',
        backgroundColor: 'rgba(54,234,255,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

async function revisarResultados(preciosLive, selector = "#alert-table-body tr") {
  if (!botActivo) return;
  const filas = document.querySelectorAll(selector);

  for (const fila of filas) {
    const celdaResultado = fila.querySelector("[data-resultado]");
    if (!celdaResultado) continue;

    // Si ya está bloqueada → GANADORA
    if (fila.dataset.bloqueada === "true") {
      fila.classList.add("ganadora");
      celdaResultado.innerHTML = `<span class="result-ganadora">GANADORA</span>`;
      continue;
    }

    const symbol = fila.dataset.symbol;
    const estado = fila.dataset.estado;
    const precioAlerta = parseFloat(fila.dataset.precio);
    const entrada = parseFloat(fila.dataset.entrada);
    const alcanzoEntrada = fila.dataset.alcanzoEntrada === "true";

    // Validar estado válido
    if (estado !== "SUBIDA" && estado !== "BAJADA") {
      console.warn(`Estado inválido: ${estado}`, fila);
      continue;
    }

    // Obtener precio actual
    const precioLive = preciosLive.find(p => p.symbol === symbol)?.price;
    if (!precioLive) continue;

    if (estado === "BAJADA") {
      const objetivoBajada = precioAlerta * (1 + paramBajada / 100);

      if (precioLive >= objetivoBajada) {
        fila.dataset.bloqueada = "true";
        fila.classList.add("ganadora");
        celdaResultado.innerHTML = `<span class="result-ganadora">GANADORA</span>`;

      } else if (precioLive > precioAlerta) {
        celdaResultado.innerHTML = `<span class="result-parcial-ganadora">PARCIALMENTE GANADORA</span>`;
      } else {
        celdaResultado.innerHTML = `<span class="result-parcial-perdedora">PARCIALMENTE PERDEDORA</span>`;
      }
    } else if (estado === "SUBIDA") {
      const retroceso = precioAlerta * (1 - paramRetrocesoSubida / 100);
      const objetivoSubida = retroceso * (1 + paramSubida / 100);

      let nuevoAlcanzoEntrada = alcanzoEntrada;
      if (!alcanzoEntrada && precioLive <= retroceso) {
        nuevoAlcanzoEntrada = true;
        fila.dataset.alcanzoEntrada = "true";
      }

      if (nuevoAlcanzoEntrada) {
        if (precioLive >= objetivoSubida) {
          fila.dataset.bloqueada = "true";
          fila.classList.add("ganadora");
          celdaResultado.innerHTML = `<span class="result-ganadora">GANADORA</span>`;
        } else if (precioLive > retroceso) {
          celdaResultado.innerHTML = `<span class="result-parcial-ganadora">PARCIALMENTE GANADORA</span>`;
        } else {
          celdaResultado.innerHTML = `<span class="result-parcial-perdedora">PARCIALMENTE PERDEDORA</span>`;
        }
      } else {
        celdaResultado.innerHTML = `<span class="result-esperando">ESPERANDO ENTRADA</span>`;
      }
    }
  }
}



document.getElementById("delete-selected").addEventListener("click", async () => {
  if (!confirm("¿Estás seguro de que quieres eliminar las alertas seleccionadas?")) return;

  const seleccionadas = document.querySelectorAll(".select-alert:checked");
  const datos = [];

  seleccionadas.forEach(cb => {
    const tr = cb.closest("tr");
    const symbol = tr.dataset.symbol;
    const timestamp = tr.dataset.fecha;
    datos.push({ symbol, timestamp });
  });

  if (datos.length === 0) return;

  try {
    const res = await fetch("/api/alertas/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });

    const result = await res.json();
if (result.ok) {
    seleccionadas.forEach(cb => cb.closest("tr").remove());
    actualizarResumenAlertas();
    alert(`✅ ${result.eliminadas} alerta(s) eliminada(s)`);
} else {
    alert("❌ Error al eliminar alertas");
}

  } catch (error) {
    console.error("Error al eliminar alertas:", error);
    alert("❌ Error de red al eliminar alertas");
  }
});


document.getElementById("select-all").addEventListener("change", function () {
  const checked = this.checked;
  document.querySelectorAll(".select-alert").forEach(cb => {
    cb.checked = checked;
  });
});

document.getElementById("open-history").addEventListener("click", () => {
  let currentPage = 1;
  const perPage = 30;

  async function cargarPagina(page = 1) {
    const res = await fetch(`/api/historial_completo?page=${page}&limit=${perPage}`);
    const data = await res.json();
    await renderModal(data.alertas, data.page, data.pages);
  }

  async function renderModal(alertas, page, totalPages) {
    const modal = document.createElement("div");
    modal.id = "modal-historial";
    modal.style.position = "fixed";
    modal.style.top = "5%";
    modal.style.left = "5%";
    modal.style.width = "90%";
    modal.style.height = "90%";
    modal.style.background = "#111";
    modal.style.border = "2px solid #0ff";
    modal.style.borderRadius = "10px";
    modal.style.zIndex = "9999";
    modal.style.overflow = "auto";
    modal.style.padding = "20px";

    const filas = alertas.map(a => {
      const dec = getDecimalesDinamicos(a.price);
      const colorPrecio = a.estado === "SUBIDA" ? "text-green-300" : "text-red-400";
let resultado = "";
if (a.bloqueada) {
  resultado = `<span class="result-ganadora">GANADORA</span>`;
} else if (a.estado === "SUBIDA") {
  resultado = `<span class="result-esperando">ESPERANDO ENTRADA</span>`;
} else {
  resultado = `<span class="result-parcial-perdedora">PARCIALMENTE PERDEDORA</span>`;
}


      return `
        <tr data-symbol="${a.symbol}" data-fecha="${a.timestamp}" data-estado="${a.estado}" 
            data-precio="${a.price}" data-objetivo="${a.objetivo}" data-entrada="${a.entrada}"
            data-alcanzo-entrada="${a.alcanzoEntrada}" data-bloqueada="${a.bloqueada}">
          <td>🔔 ${a.timestamp}</td>
          <td class="font-bold text-cyan-400">${a.symbol}</td>
          <td class="${colorPrecio}">$${a.price.toFixed(dec)}</td>
          <td class="${a.estado === 'SUBIDA' ? 'status-up' : 'status-down'}">${a.estado} +${a.porcentaje}%</td>
          <td data-resultado>${resultado}</td>
          <td class="text-center"><input type="checkbox" class="select-alert"></td>
        </tr>
      `;
    }).join("");

    modal.innerHTML = `
      <button id="btn-close-modal"
        style="position:absolute;top:10px;right:10px;background:#f00;color:#fff;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;">Cerrar</button>
      <button id="btn-maximize-modal"
        style="position:absolute;top:10px;right:80px;background:#0ff;color:#000;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;">🗖</button>
      <h1 style="color:#0ff;">📜 Historial de Alertas (página ${page} de ${totalPages})</h1>

      <div style="margin:10px 0; display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
        <div>
          <label>📅 Desde: <input type="date" id="filter-from" style="background:#222;color:#0ff;border:1px solid #0ff;padding:2px 6px;border-radius:4px;"></label>
          <label>📅 Hasta: <input type="date" id="filter-to" style="background:#222;color:#0ff;border:1px solid #0ff;padding:2px 6px;border-radius:4px;"></label>
          <button id="btn-apply-filter" style="padding:4px 10px;background:#0ff;color:#000;border:none;border-radius:5px;cursor:pointer;">Filtrar</button>
          <input type="checkbox" id="modal-select-all"> Seleccionar Todo
          <button id="modal-delete-selected" style="padding:4px 12px;background:#f33;color:#fff;border:none;border-radius:5px;">Eliminar Seleccionadas</button>
        </div>
        <div id="resumen-alertas" style="margin-left:auto;padding: 6px 14px;border: 1px solid #0ff;border-radius: 6px;background: #000;display: flex;align-items: center;gap: 16px;font-weight: bold;font-size: 14px;">
          <span style="color:#0f0;">Ganadoras: 0</span>
          <span style="color:#ff0;">Parc. Ganadoras: 0</span>
          <span style="color:#f33;">Parc. Perdedoras: 0</span>
          <span style="color:#aaa;">Esperando: 0</span>
        </div>
      </div>

      <table class="tabla-historial" style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#222;">
          <th>Fecha</th><th>Cripto</th><th>Precio</th><th>Estado</th><th>Resultado</th><th></th>
        </tr></thead>
        <tbody id="modal-table-body">${filas}</tbody>
      </table>
      <div style="margin-top:10px; display:flex; justify-content:space-between;">
        <button id="prev-page" ${page <= 1 ? "disabled" : ""}>◀️ Anterior</button>
        <button id="next-page" ${page >= totalPages ? "disabled" : ""}>Siguiente ▶️</button>
      </div>
    `;

    document.getElementById("modal-historial")?.remove();

    const estilo = document.createElement("style");
estilo.textContent = `
  .tabla-historial td,
  .tabla-historial th {
    vertical-align: middle;
    text-align: center;
    padding: 8px 12px;
  }
`;
modal.appendChild(estilo);

    document.body.appendChild(modal);

    // Actualiza resumen inicial
    actualizarResumenAlertas("#modal-table-body tr");

    // === NUEVO BLOQUE: Actualiza estados con precios en vivo ===
    const preciosLive = await fetch("/api/live").then(r => r.json());
    await revisarResultados(preciosLive, "#modal-table-body tr");
    actualizarResumenAlertas("#modal-table-body tr");

    // Eventos internos
    document.getElementById("btn-close-modal").addEventListener("click", () => modal.remove());
    const btnMax = document.getElementById("btn-maximize-modal");
    let maximized = false;
    btnMax.addEventListener("click", () => {
      if (!maximized) {
        modal.style.top = "0"; modal.style.left = "0";
        modal.style.width = "100vw"; modal.style.height = "100vh";
        modal.style.borderRadius = "0"; btnMax.textContent = "🗗";
      } else {
        modal.style.top = "5%"; modal.style.left = "5%";
        modal.style.width = "90%"; modal.style.height = "90%";
        modal.style.borderRadius = "10px"; btnMax.textContent = "🗖";
      }
      maximized = !maximized;
    });

    document.getElementById("prev-page")?.addEventListener("click", () => cargarPagina(page - 1));
    document.getElementById("next-page")?.addEventListener("click", () => cargarPagina(page + 1));

    document.getElementById("modal-select-all").addEventListener("change", function () {
      document.querySelectorAll("#modal-table-body .select-alert").forEach(cb => cb.checked = this.checked);
    });

    document.getElementById("btn-apply-filter").addEventListener("click", () => {
      const fromDate = document.getElementById("filter-from").value;
      const toDate = document.getElementById("filter-to").value;
      document.querySelectorAll("#modal-table-body tr").forEach(tr => {
        const fecha = tr.dataset.fecha?.slice(0, 10);
        let visible = true;
        if (fromDate && fecha < fromDate) visible = false;
        if (toDate && fecha > toDate) visible = false;
        tr.style.display = visible ? "" : "none";
      });
      actualizarResumenAlertas("#modal-table-body tr");
    });

    document.getElementById("modal-delete-selected").addEventListener("click", async () => {
      if (!confirm("¿Eliminar las alertas seleccionadas del historial?")) return;
      const seleccionadas = document.querySelectorAll("#modal-table-body .select-alert:checked");
      const datos = Array.from(seleccionadas).map(cb => {
        const tr = cb.closest("tr");
        return { symbol: tr.dataset.symbol, timestamp: tr.dataset.fecha };
      });
      if (datos.length === 0) {
        alert("No seleccionaste ninguna alerta.");
        return;
      }
      try {
        const res = await fetch("/api/historial_completo/eliminar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datos)
        });
        const result = await res.json();
        if (result.ok) {
          seleccionadas.forEach(cb => cb.closest("tr").remove());
          actualizarResumenAlertas("#modal-table-body tr");
          alert(`✅ ${result.eliminadas} alerta(s) eliminada(s)`);
        } else {
          alert("❌ No se pudieron eliminar: " + JSON.stringify(result));
        }
      } catch (err) {
        console.error("Error de red al eliminar:", err);
        alert("❌ Error de red al eliminar alertas");
      }
    });
  }

  cargarPagina(currentPage);
});



const modalSettings = document.getElementById("settings-modal");
const btnOpenSettings = document.getElementById("open-settings");
const btnCloseSettings = document.getElementById("close-settings");
const btnSaveSettings = document.getElementById("save-settings");
const inputRetrocesoSubida = document.getElementById("param-retroceso-subida");
const inputSubida = document.getElementById("param-subida");
const inputBajada = document.getElementById("param-bajada");

const confirmationText = document.createElement("div");
confirmationText.style.position = "fixed";
confirmationText.style.top = "10%";
confirmationText.style.right = "10%";
confirmationText.style.padding = "10px 20px";
confirmationText.style.background = "#0ff";
confirmationText.style.color = "#000";
confirmationText.style.fontWeight = "bold";
confirmationText.style.borderRadius = "8px";
confirmationText.style.boxShadow = "0 0 10px #0ff";
confirmationText.style.opacity = "0";
confirmationText.style.transition = "opacity 0.3s";
confirmationText.style.zIndex = "9999";
confirmationText.textContent = "Cambios guardados";
document.body.appendChild(confirmationText);

function showConfirmation() {
  confirmationText.style.opacity = "1";
  setTimeout(() => {
    confirmationText.style.opacity = "0";
  }, 2000);
}

btnOpenSettings.addEventListener("click", () => {
  inputRetrocesoSubida.value = paramRetrocesoSubida;
  inputSubida.value = paramSubida;
  inputBajada.value = paramBajada;
  modalSettings.classList.remove("hidden");
});

btnCloseSettings.addEventListener("click", () => {
  modalSettings.classList.add("hidden");
});

btnSaveSettings.addEventListener("click", () => {
  const valRetroceso = parseFloat(inputRetrocesoSubida.value);
  const valSubida = parseFloat(inputSubida.value);
  const valBajada = parseFloat(inputBajada.value);

  if ([valRetroceso, valSubida, valBajada].some(v => isNaN(v) || v < 0)) {
    alert("Por favor ingresa valores válidos para los parámetros.");
    return;
  }

  paramRetrocesoSubida = valRetroceso;
  paramSubida = valSubida;
  paramBajada = valBajada;

  modalSettings.classList.add("hidden");
  showConfirmation();
});

function startAutoUpdate() {
  if (!botActivo) return; // 🚫 No arrancar si está apagado
  const intervalStr = document.getElementById("interval").value || "1m";
  const ms = parseIntervalToMs(intervalStr);
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(fetchData, ms); // Primera ejecución será en el intervalo, no inmediata
}

document.getElementById("interval").addEventListener("change", startAutoUpdate);
document.getElementById("umbral").addEventListener("input", fetchData);

window.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("bot-toggle");
  const savedState = localStorage.getItem("bot_activado");

  if (savedState === "true") {
    toggle.checked = true;
    toggleBot(true);
  } else {
    toggle.checked = false;
    toggleBot(false);
  }

toggle.addEventListener("change", () => {
  const checked = toggle.checked;
  localStorage.setItem("bot_activado", checked);

  if (checked) {
    localStorage.setItem("bot_manual", true); // 👉 Encendido manual: activar modo manual
  } else {
    localStorage.removeItem("bot_manual");    // 👉 Apagado manual: volver al modo automático
  }

  toggleBot(checked);

  if (checked) {
    document.getElementById("alert-table-body").innerHTML = "";
    cargarAlertasDesdeServidor();
    fetchData();
    startAutoUpdate();
  }
});



  iniciarVerificacionHorarios(); // ⏰ Arranca revisión automática
});






// Inicializar flatpickr en los campos de "Desde" y "Hasta"
flatpickr("#modal-date-from", {
  dateFormat: "Y-m-d",
  maxDate: "today",
  allowInput: true,
});

flatpickr("#modal-date-to", {
  dateFormat: "Y-m-d",
  maxDate: "today",
  allowInput: true,
});

// Lógica para el botón "Aplicar filtro"
document.getElementById("modal-apply-filter").addEventListener("click", () => {
  const fromDate = document.getElementById("modal-date-from").value;
  const toDate = document.getElementById("modal-date-to").value;

  if (fromDate && toDate) {
    filterHistoryByDate(fromDate, toDate);
  } else {
    alert("Por favor, seleccione ambas fechas.");
  }
});

// Lógica para el botón "Limpiar filtro"
document.getElementById("modal-clear-filter").addEventListener("click", () => {
  document.getElementById("modal-date-from").value = "";
  document.getElementById("modal-date-to").value = "";
  filterHistoryByDate("", "");
});

// Función para filtrar el historial por fechas
function filterHistoryByDate(from, to) {
  const rows = document.querySelectorAll("#history-table-body tr");
  rows.forEach(row => {
    const rowDate = row.querySelector("td:first-child").textContent.trim();
    const rowDateObj = new Date(rowDate);
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (from && to) {
      if (rowDateObj >= fromDate && rowDateObj <= toDate) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    } else {
      row.style.display = "";
    }
  });
}




async function guardarAlertaEnServidor(alerta) {
  try {
    await fetch("/api/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alerta)
    });
    console.log("✅ Alerta guardada en el servidor");
  } catch (error) {
    console.error("❌ Error al guardar alerta:", error);
  }
}


async function cargarAlertasDesdeServidor() {
  const res = await fetch("/api/alertas");
  const alertas = await res.json();
  const tbody = document.getElementById("alert-table-body");

  alertas.forEach(alerta => {
    const tr = document.createElement("tr");
    tr.dataset.symbol = alerta.symbol;
    tr.dataset.fecha = alerta.timestamp;
    tr.dataset.estado = alerta.estado;
    tr.dataset.precio = alerta.price;
    tr.dataset.objetivo = alerta.objetivo;
    tr.dataset.entrada = alerta.entrada;
    tr.dataset.alcanzoEntrada = alerta.alcanzoEntrada ? "true" : "false";
    tr.dataset.bloqueada = alerta.bloqueada ? "true" : "false";

    const decimales = getDecimalesDinamicos(alerta.price);
    const colorPrecio = alerta.estado === "SUBIDA" ? "text-green-300" : "text-red-400";

    tr.innerHTML = `
      <td class="py-1 px-4">🔔 ${alerta.timestamp}</td>
      <td class="py-1 px-4 font-bold text-cyan-400">${alerta.symbol}</td>
      <td class="py-1 px-2 text-cyan-300 cursor-pointer text-xl"
        onclick="expandirGrafico('${alerta.symbol}', ${alerta.price}, ${alerta.objetivo}, ${alerta.entrada}, '${alerta.estado}')">📊</td>
      <td class="py-1 px-4 ${colorPrecio}">
        $${alerta.price.toFixed(decimales)}
        <span class="ml-2 cursor-pointer text-cyan-300 hover:text-white text-lg"
          onclick="mostrarDetallesAlerta(this, '${alerta.estado}', ${alerta.price}, ${alerta.entrada}, ${alerta.objetivo})">ℹ️</span>
      </td>
      <td class="py-1 px-4 ${alerta.estado === 'SUBIDA' ? 'status-up' : 'status-down'}">${alerta.estado} +${alerta.porcentaje}%</td>
      <td class="py-1 px-4" data-resultado>
<span class="${alerta.estado === 'SUBIDA' ? 'result-esperando' : 'result-parcial-perdedora'}">
  ${alerta.estado === 'SUBIDA' ? 'ESPERANDO ENTRADA' : 'PARCIALMENTE PERDEDORA'}
</span>

</td>

      <td class="py-1 px-4 text-center"><input type="checkbox" class="select-alert"></td>
    `;

    tbody.appendChild(tr);

    if (alerta.bloqueada) {
      tr.classList.add("ganadora");
      const celda = tr.querySelector("[data-resultado]");
      if (celda) {
        celda.innerHTML = `<span class="result-ganadora">GANADORA</span>`;
      }
    }

    drawChart(`chart-${alerta.symbol}`, alerta.symbol);
  });

const preciosLive = await fetch("/api/live").then(r => r.json());
await revisarResultados(preciosLive, "#modal-table-body tr");
actualizarResumenAlertas("#modal-table-body tr");

}


function expandirGrafico(symbol) {
  const tradingViewSymbol = "BINANCE:" + symbol.toUpperCase();
  const binanceUrl = `https://www.binance.com/en/trade/${symbol.replace('USDT', '')}_USDT`;

  // Eliminar modal previo si existe
  const oldModal = document.getElementById("tv-modal");
  if (oldModal) oldModal.remove();

  const modal = document.createElement("div");
  modal.id = "tv-modal";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100vw";
  modal.style.height = "100vh";
  modal.style.background = "#000";
  modal.style.zIndex = "9999";
  modal.style.padding = "20px";
  modal.style.boxSizing = "border-box";

  modal.innerHTML = `
    <button onclick="document.body.removeChild(document.getElementById('tv-modal'))"
      style="position:absolute;top:10px;right:10px;background:#f00;color:#fff;
      padding:8px 16px;border:none;border-radius:6px;font-size:16px;z-index:10000;">
      Cerrar ✖
    </button>

    <a href="${binanceUrl}" target="_blank" rel="noopener noreferrer"
      style="position:absolute;top:10px;left:10px;background:#0ff;color:#000;
      padding:8px 14px;border-radius:6px;font-weight:bold;text-decoration:none;
      box-shadow:0 0 10px #0ff;">
      🔗 Ver en Binance
    </a>

    <div style="
      width:100%;
      height:calc(100% - 60px);
      margin-top:60px;
      padding:10px;
      background:#111;
      border:2px solid #0ff;
      border-radius:12px;
      box-shadow: 0 0 20px #0ff3;
      box-sizing: border-box;
    ">
      <div id="tv-chart" style="width:100%; height:100%;"></div>
    </div>
  `;

  document.body.appendChild(modal);

  if (!document.getElementById("tv-script")) {
    const script = document.createElement("script");
    script.id = "tv-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.onload = () => renderTVChart(tradingViewSymbol);
    document.head.appendChild(script);
  } else {
    renderTVChart(tradingViewSymbol);
  }
}

function renderTVChart(symbol) {
  new TradingView.widget({
    autosize: true,
    symbol: symbol,
    interval: "1", // ← Temporalidad predeterminada: 1 minuto
    timezone: "America/Caracas", // ← Zona horaria de Venezuela
    theme: "dark",
    style: "1",
    locale: "es",
    toolbar_bg: "#000",
    enable_publishing: false,
    allow_symbol_change: false,
    container_id: "tv-chart"
  });
}

function mostrarDetallesAlerta(el, estado, precioAlerta, entrada, salida) {
  // Elimina tooltip anterior si existe
  const old = document.getElementById("tooltip-alerta");
  if (old) old.remove();

  // Crear nuevo tooltip
  const tooltip = document.createElement("div");
  tooltip.id = "tooltip-alerta";
  tooltip.style.position = "absolute";
  tooltip.style.background = "#111";
  tooltip.style.color = "#0ff";
  tooltip.style.border = "1px solid #0ff";
  tooltip.style.padding = "10px 14px";
  tooltip.style.borderRadius = "8px";
  tooltip.style.boxShadow = "0 0 12px #0ff9";
  tooltip.style.zIndex = 9999;
  tooltip.style.fontSize = "14px";
  tooltip.style.maxWidth = "250px";

  // Posición junto al ícono clicado
  const rect = el.getBoundingClientRect();
  tooltip.style.top = `${rect.top + window.scrollY + 24}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  // Contenido según tipo
  let html = `<strong class="text-cyan-300">ℹ️ Detalles de la Alerta</strong><br>`;
  const dec = getDecimalesDinamicos(precioAlerta);
html += `🔹 <b>Precio de alerta:</b> $${precioAlerta.toFixed(dec)}<br>`;

  if (estado === "SUBIDA") {
    const dec = getDecimalesDinamicos(precioAlerta);
    html += `📉 <b>Entrada (retroceso):</b> $${entrada.toFixed(dec)}<br>`;
    html += `🎯 <b>Objetivo de salida:</b> $${salida.toFixed(dec)}`;
  } else {
    const dec = getDecimalesDinamicos(precioAlerta);
    html += `🎯 <b>Objetivo de salida:</b> $${salida.toFixed(dec)}`;
  }

  tooltip.innerHTML = html;

  // Cierra el tooltip al hacer clic fuera
  setTimeout(() => {
    document.addEventListener("click", function ocultar(e) {
      if (!tooltip.contains(e.target) && e.target !== el) {
        tooltip.remove();
        document.removeEventListener("click", ocultar);
      }
    });
  }, 50); // Para no disparar cierre inmediato

  document.body.appendChild(tooltip);
}
function actualizarResumenAlertas(selector = "#alert-table-body tr") {
  const filas = document.querySelectorAll(selector);
  let ganadoras = 0;
  let parcGanadoras = 0;
  let parcPerdedoras = 0;
  let esperando = 0;

  filas.forEach(fila => {
    const celda = fila.querySelector("[data-resultado]");
    if (!celda || fila.style.display === "none") return;

    const contenido = celda.textContent?.trim().toUpperCase();

if (contenido === "GANADORA") {
  ganadoras++;
} else if (contenido === "PARCIALMENTE GANADORA") {
  parcGanadoras++;
} else if (contenido === "PARCIALMENTE PERDEDORA") {
  parcPerdedoras++;
} else if (contenido === "ESPERANDO ENTRADA") {
  esperando++;
}

  });

  const resumenEl = document.getElementById("resumen-alertas");
  if (resumenEl) {
    resumenEl.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 16px;">
        <img src="https://i.ibb.co/p6xGw1w4/trafficlight-green-40427.png" style="width:14px;height:14px;"> 
        <span class="text-green-400">Ganadoras: ${ganadoras}</span>
      </span>
      <span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 16px;">
        <img src="https://i.ibb.co/hRwDPhQD/pngwing-com.png" style="width:14px;height:14px;"> 
        <span style="color:#bbe209;">Parcialmente Ganadoras: ${parcGanadoras}</span>
      </span>
      <span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 16px;">
        <img src="https://i.ibb.co/vvdg1CKZ/trafficlight-red-40428.png" style="width:14px;height:14px;"> 
        <span class="text-red-400">Parcialmente Perdedoras: ${parcPerdedoras}</span>
      </span>
      <span style="display: inline-flex; align-items: center; gap: 4px;">
        <img src="https://i.ibb.co/RkqNvR96/pnfff.png" style="width:14px;height:14px;"> 
        <span class="text-gray-200">Esperando Entrada: ${esperando}</span>
      </span>
    `;
  }
}



// ⏰ Verificar cada minuto si llegó la hora programada para activar el bot
function iniciarVerificacionHorarios() {
setInterval(async () => {
  const toggle = document.getElementById("bot-toggle");

  const esManual = localStorage.getItem("bot_manual") === "true";
  if (esManual) {
    console.log("⏸️ Modo manual activado. No se cambia el estado automáticamente.");
    return;
  }

    try {
      const res = await fetch("/api/horarios");
      const horarios = await res.json();

      const ahora = new Date();
      const fechaHoy = ahora.getFullYear() + "-" + 
                      String(ahora.getMonth() + 1).padStart(2, "0") + "-" + 
                      String(ahora.getDate()).padStart(2, "0");

      const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

      console.log("⏱️ Revisión automática:");
      console.log("📅 Hoy:", fechaHoy);
      console.log("🕒 Hora actual:", ahora.toTimeString().slice(0, 5), `(${minutosAhora} minutos)`);

      let debeEstarActivo = false;

      for (const h of horarios) {
        console.log("📌 Evaluando horario:", h);

        const fechaInicio = h.fecha_inicio;
        const fechaFin = h.fecha_fin;
        const [hInicio, mInicio] = (h.horaInicio || h.inicio).split(":").map(Number);
        const [hFin, mFin] = (h.horaFin || h.fin).split(":").map(Number);

        const minInicio = hInicio * 60 + mInicio;
        const minFin = hFin * 60 + mFin;

        if (fechaHoy >= fechaInicio && fechaHoy <= fechaFin) {
          if (minutosAhora >= minInicio && minutosAhora < minFin) {
            console.log("✅ Coincide con este horario → debe activarse");
            debeEstarActivo = true;
            break;
          } else {
            console.log("⛔ Dentro del rango de fecha, pero fuera de hora");
          }
        } else {
          console.log("⛔ No está dentro del rango de fechas");
        }
      }

      if (debeEstarActivo && !toggle.checked) {
        console.log("🟢 Activando bot automáticamente...");
        toggle.checked = true;
        localStorage.setItem("bot_activado", true);
        toggleBot(true);
      } else if (!debeEstarActivo && toggle.checked) {
        console.log("🔴 Desactivando bot automáticamente...");
        toggle.checked = false;
        localStorage.setItem("bot_activado", false);
        toggleBot(false);
      } else {
        console.log("ℹ️ Estado del bot no cambia.");
      }

    } catch (e) {
      console.error("❌ Error al consultar /api/horarios:", e);
    }
  }, 10000); // Cada 10 segundos
}




