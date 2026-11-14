// Generador de bienvenida: el equipo sube/pega su logo y se dibuja dentro del
// marco del póster (assets/bienvenida.jpg, 1080×1350). Todo ocurre en el
// navegador: el logo nunca se sube a ningún servidor.
(() => {
  const root = document.getElementById("bienvenida");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const W = 1080, H = 1350;
  // Marco verde del póster (borde interior, en px de la imagen original)
  const FRAME = { x: 223, y: 428, w: 634, h: 635 };
  const PAD = 46, NAME_H = 92;

  const cv = $("#wb-canvas");
  const ctx = cv.getContext("2d");
  cv.width = W; cv.height = H;

  let poster = null, logo = null, logoUrl = null;

  const load = (src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo leer la imagen"));
    img.src = src;
  });

  const fit = (text, maxW, size) => {
    let s = size;
    do { ctx.font = `400 ${s}px "Bebas Neue", Impact, sans-serif`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 24);
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (poster) ctx.drawImage(poster, 0, 0, W, H);
    else { ctx.fillStyle = "#010401"; ctx.fillRect(0, 0, W, H); }

    const name = $("#wb-name").value.trim().toUpperCase();
    const scale = Number($("#wb-size").value) / 100;
    const boxX = FRAME.x + PAD, boxY = FRAME.y + PAD;
    const boxW = FRAME.w - PAD * 2, boxH = FRAME.h - PAD * 2 - (name ? NAME_H : 0);

    if (logo) {
      const k = Math.min(boxW / logo.width, boxH / logo.height) * scale;
      const w = logo.width * k, h = logo.height * k;
      ctx.save();
      ctx.shadowColor = "rgba(57,255,20,.35)"; ctx.shadowBlur = 48;
      ctx.drawImage(logo, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(122,170,96,.55)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `400 46px "Bebas Neue", Impact, sans-serif`;
      ctx.fillText("TU LOGO AQUÍ", FRAME.x + FRAME.w / 2, boxY + boxH / 2);
    }

    if (name) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      fit(name, FRAME.w - 60, 72);
      ctx.save();
      ctx.shadowColor = "rgba(57,255,20,.55)"; ctx.shadowBlur = 24;
      ctx.fillStyle = "#39ff14";
      ctx.fillText(name, FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h - PAD - NAME_H / 2 + 6);
      ctx.restore();
    }
    $("#wb-download").disabled = !logo;
    $("#wb-share").disabled = !logo;
  }

  async function useFile(file) {
    if (!file || !file.type.startsWith("image/")) return status("Ese archivo no es una imagen.", true);
    if (file.size > 15 * 1024 * 1024) return status("La imagen pesa demasiado (máx. 15 MB).", true);
    try {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      logoUrl = URL.createObjectURL(file);
      logo = await load(logoUrl);
      status("Logo listo. Ajusta el tamaño y descarga tu imagen.");
      draw();
    } catch (err) { status(err.message, true); }
  }

  const status = (msg, err = false) => {
    const el = $("#wb-status");
    el.textContent = msg;
    el.classList.toggle("err", err);
  };

  const fileName = () => {
    const n = $("#wb-name").value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `pyrocore-bienvenida${n ? "-" + n : ""}.png`;
  };
  const toBlob = () => new Promise((res) => cv.toBlob(res, "image/png"));

  // Subir, arrastrar o pegar
  const drop = $("#wb-drop");
  $("#wb-file").addEventListener("change", (e) => useFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => useFile(e.dataTransfer.files[0]));
  addEventListener("paste", (e) => {
    const r = root.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return; // solo si la sección está en pantalla
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); useFile(item.getAsFile()); }
  });

  $("#wb-name").addEventListener("input", draw);
  $("#wb-size").addEventListener("input", draw);

  $("#wb-download").addEventListener("click", async () => {
    const blob = await toBlob();
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: fileName() });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // Compartir directo (móvil: Instagram, WhatsApp…)
  const shareBtn = $("#wb-share");
  if (!(navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] }))) shareBtn.hidden = true;
  shareBtn.addEventListener("click", async () => {
    const file = new File([await toBlob()], fileName(), { type: "image/png" });
    try { await navigator.share({ files: [file], title: "PYROCORE LEAGUE S1" }); } catch (_) {}
  });

  Promise.all([
    load("assets/bienvenida.jpg").then((img) => { poster = img; }).catch(() => {}),
    document.fonts?.load('400 46px "Bebas Neue"').catch(() => {}),
  ]).then(draw);
  draw();
})();
