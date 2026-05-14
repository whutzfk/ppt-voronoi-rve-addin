const state = {
  svgText: "",
  metrics: null
};

const $ = (id) => document.getElementById(id);

const DEFAULT_TARGET_CV = {
  uniform: 0.15,
  random: 0.6,
  clustered: 0.85
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function numberValue(id, fallback) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function textValue(id, fallback) {
  return $(id).value || fallback;
}

function randomPoints(count, width, height, rng) {
  return Array.from({ length: count }, () => [rng() * width, rng() * height]);
}

function clusteredPoints(count, width, height, rng, targetCv) {
  const clusterCount = clamp(Math.round(Math.sqrt(count) / (1.8 + targetCv * 2.0)), 2, Math.min(8, count));
  const baseSpread = Math.min(width, height) / Math.max(5, Math.sqrt(count));
  const spread = baseSpread * clamp(0.95 - targetCv * 0.75, 0.12, 0.7);
  const centers = randomPoints(clusterCount, width, height, rng);
  const points = [];

  while (points.length < count) {
    const center = centers[Math.floor(rng() * centers.length)];
    const angle = rng() * Math.PI * 2;
    const radius = spread * Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9)));
    const x = clamp(center[0] + Math.cos(angle) * radius, 0, width);
    const y = clamp(center[1] + Math.sin(angle) * radius, 0, height);
    points.push([x, y]);
  }

  return points;
}

function polygonCentroid(points) {
  const areaSigned = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);

  if (Math.abs(areaSigned) < 1e-9) {
    return [
      points.reduce((sum, p) => sum + p[0], 0) / points.length,
      points.reduce((sum, p) => sum + p[1], 0) / points.length
    ];
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }

  const factor = 1 / (3 * areaSigned);
  return [cx * factor, cy * factor];
}

function lloydRelax(points, width, height, iterations) {
  let relaxed = points.map((p) => [...p]);

  for (let iter = 0; iter < iterations; iter += 1) {
    const delaunay = d3.Delaunay.from(relaxed);
    const voronoi = delaunay.voronoi([0, 0, width, height]);
    relaxed = relaxed.map((point, i) => {
      const poly = voronoi.cellPolygon(i);
      if (!poly || poly.length < 4) return point;
      const centroid = polygonCentroid(poly.slice(0, -1));
      return [clamp(centroid[0], 0, width), clamp(centroid[1], 0, height)];
    });
  }

  return relaxed;
}

function generateSeedPoints(mode, count, width, height, rng, targetCv) {
  const base = randomPoints(count, width, height, rng);
  if (mode === "uniform") {
    const iterations = Math.round(clamp((0.72 - targetCv) * 14, 1, 10));
    return lloydRelax(base, width, height, iterations);
  }
  if (mode === "clustered") {
    return clusteredPoints(count, width, height, rng, targetCv);
  }
  if (targetCv < 0.48) {
    const iterations = Math.round(clamp((0.48 - targetCv) * 10, 1, 4));
    return lloydRelax(base, width, height, iterations);
  }
  if (targetCv > 0.72) {
    return clusteredPoints(count, width, height, rng, targetCv);
  }
  return base;
}

function nearestNeighborStats(points) {
  const distances = points.map((p, i) => {
    let nearest = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const q = points[j];
      const distance = Math.hypot(p[0] - q[0], p[1] - q[1]);
      nearest = Math.min(nearest, distance);
    }
    return nearest;
  });
  const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const variance = distances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / distances.length;
  return { mean, cv: Math.sqrt(variance) / Math.max(mean, 1e-9) };
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(sum) / 2;
}

function pathFromPolygon(points) {
  if (points.length < 3) return "";
  return `M${points.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join("L")}Z`;
}

function updateUniformityDefaults() {
  const mode = textValue("uniformity", "random");
  $("targetCv").value = DEFAULT_TARGET_CV[mode].toFixed(2);
}

function syncConstraintInputs() {
  const constraintMode = textValue("constraintMode", "porosity");
  $("porosity").disabled = constraintMode !== "porosity";
  $("wallThickness").disabled = constraintMode !== "wall";
}

function generateRve() {
  const width = Math.max(1, numberValue("width", 100));
  const height = Math.max(1, numberValue("height", 100));
  const cellCount = clamp(Math.round(numberValue("cellCount", 80)), 3, 2000);
  const inputWallThickness = Math.max(0, numberValue("wallThickness", 1.69));
  const inputPorosity = clamp(numberValue("porosity", 0.75), 0.01, 0.99);
  const constraintMode = textValue("constraintMode", "porosity");
  const uniformity = textValue("uniformity", "random");
  const targetCv = clamp(numberValue("targetCv", DEFAULT_TARGET_CV[uniformity] || 0.6), 0.05, 1.5);
  const seed = Math.round(numberValue("seed", 42));
  const meanCellDiameter = Math.sqrt((4 * width * height) / (Math.PI * cellCount));
  let targetPorosity = inputPorosity;
  let wallThickness = inputWallThickness;
  let k = Math.sqrt(targetPorosity);

  if (constraintMode === "wall") {
    wallThickness = clamp(inputWallThickness, 0, meanCellDiameter * 0.95);
    k = clamp(1 - wallThickness / Math.max(meanCellDiameter, 1e-9), 0.05, 0.98);
    targetPorosity = clamp(k * k, 0.01, 0.99);
    $("porosity").value = targetPorosity.toFixed(3);
    $("wallThickness").value = wallThickness.toFixed(2);
  } else {
    targetPorosity = inputPorosity;
    k = clamp(Math.sqrt(targetPorosity), 0.05, 0.98);
    wallThickness = Math.max(0, (1 - k) * meanCellDiameter);
    $("wallThickness").value = wallThickness.toFixed(2);
    $("porosity").value = targetPorosity.toFixed(3);
  }

  const rng = mulberry32(seed);
  const points = generateSeedPoints(uniformity, cellCount, width, height, rng, targetCv);
  const neighborStats = nearestNeighborStats(points);
  const delaunay = d3.Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  const outerPaths = [];
  const porePaths = [];
  let totalArea = 0;
  let poreArea = 0;

  for (let i = 0; i < cellCount; i += 1) {
    const poly = voronoi.cellPolygon(i);
    if (!poly || poly.length < 4) continue;
    const pointsOnly = poly.slice(0, -1);
    const area = polygonArea(pointsOnly);
    if (area <= 1e-8) continue;
    const cx = pointsOnly.reduce((sum, p) => sum + p[0], 0) / pointsOnly.length;
    const cy = pointsOnly.reduce((sum, p) => sum + p[1], 0) / pointsOnly.length;
    const pore = pointsOnly.map((p) => [cx + k * (p[0] - cx), cy + k * (p[1] - cy)]);
    const porePolyArea = polygonArea(pore);
    totalArea += area;
    poreArea += porePolyArea;
    outerPaths.push(`<path d="${pathFromPolygon(pointsOnly)}" class="cell"/>`);
    porePaths.push(`<path d="${pathFromPolygon(pore)}" class="pore"/>`);
  }

  const renderedPorosity = totalArea > 0 ? poreArea / totalArea : 0;
  const px = 900;
  const py = Math.max(320, Math.round(px * height / width));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${py}" viewBox="0 0 ${width} ${height}" role="img" aria-label="2D Voronoi RVE">
  <style>
    .bg{fill:#f8f8f2}.cell{fill:#dfe8e6;stroke:#344850;stroke-width:${Math.max(width, height) * 0.0025}}.pore{fill:#fff;stroke:#147a7e;stroke-width:${Math.max(width, height) * 0.0015}}.seed{fill:#162326}
  </style>
  <rect class="bg" x="0" y="0" width="${width}" height="${height}"/>
  ${outerPaths.join("\n  ")}
  ${porePaths.join("\n  ")}
  ${points.map((p) => `<circle class="seed" cx="${p[0].toFixed(3)}" cy="${p[1].toFixed(3)}" r="${Math.max(width, height) * 0.004}"/>`).join("\n  ")}
</svg>`;

  state.svgText = svg;
  state.metrics = {
    width,
    height,
    cellCount,
    wallThickness,
    constraintMode,
    uniformity,
    targetCv,
    targetPorosity,
    renderedPorosity,
    meanCellDiameter,
    nearestNeighborMean: neighborStats.mean,
    nearestNeighborCv: neighborStats.cv,
    scalingFactor: k
  };

  const uniformityLabel = {
    random: "随机",
    uniform: "均匀 / Lloyd松弛",
    clustered: "不均匀 / 聚簇随机"
  }[uniformity] || "随机";

  $("preview").innerHTML = svg;
  $("metrics").innerHTML = [
    `结构均匀度: ${uniformityLabel}`,
    `目标变异系数: ${targetCv.toFixed(3)}`,
    `等效平均泡孔直径: ${meanCellDiameter.toFixed(2)} um`,
    `最近邻距离均值: ${neighborStats.mean.toFixed(2)} um`,
    `最近邻距离变异系数: ${neighborStats.cv.toFixed(3)}`,
    `约束方式: ${constraintMode === "wall" ? "输入壁厚，自动计算孔隙率" : "输入孔隙率，自动计算壁厚"}`,
    `壁厚: ${wallThickness.toFixed(2)} um`,
    `孔隙率: ${targetPorosity.toFixed(3)}`,
    `渲染孔隙率估计: ${renderedPorosity.toFixed(3)}`,
    `几何缩放因子 K: ${k.toFixed(3)}`
  ].join("<br>");
}

async function svgToPngBase64(svgText) {
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    img.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function outputBaseName() {
  const metrics = state.metrics || {};
  const width = Math.round(metrics.width || numberValue("width", 100));
  const height = Math.round(metrics.height || numberValue("height", 100));
  const cells = Math.round(metrics.cellCount || numberValue("cellCount", 80));
  const porosity = Number(metrics.targetPorosity || numberValue("porosity", 0.75)).toFixed(2).replace(".", "p");
  const seed = Math.round(numberValue("seed", 42));
  return `voronoi_rve_${width}x${height}um_${cells}cells_phi${porosity}_seed${seed}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadSvg() {
  if (!state.svgText) generateRve();
  downloadBlob(
    new Blob([state.svgText], { type: "image/svg+xml;charset=utf-8" }),
    `${outputBaseName()}.svg`
  );
  $("metrics").innerHTML += "<br>已生成SVG下载。";
}

async function downloadPng() {
  if (!state.svgText) generateRve();
  try {
    const imageBase64 = await svgToPngBase64(state.svgText);
    const bytes = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));
    downloadBlob(new Blob([bytes], { type: "image/png" }), `${outputBaseName()}.png`);
    $("metrics").innerHTML += "<br>已生成PNG下载。";
  } catch (error) {
    $("metrics").innerHTML += `<br>PNG下载失败: ${error.message}`;
  }
}

async function insertIntoPowerPoint() {
  if (!state.svgText) generateRve();
  const canInsertIntoHost =
    window.Office &&
    Office.context &&
    Office.context.document &&
    typeof Office.context.document.setSelectedDataAsync === "function" &&
    Office.CoercionType;

  if (!canInsertIntoHost) {
    $("metrics").innerHTML += "<br>插入PPT需要在PowerPoint侧载加载项的任务窗格中运行；浏览器预览只能生成和检查RVE图像。";
    return;
  }

  try {
    const imageBase64 = await svgToPngBase64(state.svgText);
    Office.context.document.setSelectedDataAsync(
      imageBase64,
      { coercionType: Office.CoercionType.Image },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          $("metrics").innerHTML += `<br>插入失败: ${result.error.message}`;
        } else {
          $("metrics").innerHTML += "<br>已插入当前幻灯片。";
        }
      }
    );
  } catch (error) {
    $("metrics").innerHTML += `<br>插入失败: ${error.message}`;
  }
}

function init() {
  $("uniformity").addEventListener("change", () => {
    updateUniformityDefaults();
    generateRve();
  });
  $("constraintMode").addEventListener("change", () => {
    syncConstraintInputs();
    generateRve();
  });
  $("generate").addEventListener("click", generateRve);
  $("insert").addEventListener("click", insertIntoPowerPoint);
  $("downloadSvg").addEventListener("click", downloadSvg);
  $("downloadPng").addEventListener("click", downloadPng);
  syncConstraintInputs();
  generateRve();
}

if (window.Office) {
  Office.onReady(init);
} else {
  window.addEventListener("DOMContentLoaded", init);
}
