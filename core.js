/* PuzzleCore: tách mảnh ghép trong ảnh + so khớp hình dạng với thư viện (cả mặt ngửa và mặt úp). */
(function (root) {
  'use strict';
  const NC = 48, NF = 64;          // độ phân giải raster: thô / tinh
  const SC = 45 / 128;             // cạnh căn-diện-tích chiếm 45/128 khung

  function popcnt(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }

  // ---------- thư viện ----------
  function polyStats(p) {
    let A = 0, cx = 0, cy = 0; const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const x0 = p[2 * i], y0 = p[2 * i + 1], j = (i + 1) % n, x1 = p[2 * j], y1 = p[2 * j + 1];
      const c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    A /= 2; return { area: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) };
  }
  function rasterPoly(p, st, N) {
    const W = N >> 5, bits = new Uint32Array(N * W), n = p.length / 2;
    const s = N * SC / Math.sqrt(st.area);
    const xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = (p[2 * i] - st.cx) * s + N / 2; ys[i] = (p[2 * i + 1] - st.cy) * s + N / 2; }
    const X = [];
    for (let r = 0; r < N; r++) {
      const yc = r + 0.5; X.length = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, y0 = ys[i], y1 = ys[j];
        if ((y0 <= yc) !== (y1 <= yc)) X.push(xs[i] + (yc - y0) / (y1 - y0) * (xs[j] - xs[i]));
      }
      X.sort((a, b) => a - b);
      for (let k = 0; k + 1 < X.length; k += 2) {
        const a = Math.max(0, Math.ceil(X[k] - 0.5)), b = Math.min(N - 1, Math.floor(X[k + 1] - 0.5));
        for (let c = a; c <= b; c++) bits[r * W + (c >> 5)] |= 1 << (c & 31);
      }
    }
    return bits;
  }
  function cnt(b) { let s = 0; for (let i = 0; i < b.length; i++) s += popcnt(b[i]); return s; }
  function buildLibrary(entries) {
    return entries.map(([num, p]) => {
      const st = polyStats(p), c = rasterPoly(p, st, NC), f = rasterPoly(p, st, NF);
      return { num, poly: p, area: st.area, c, cc: cnt(c), f, fc: cnt(f) };
    });
  }

  // ---------- màu ----------
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const fl = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  function boxBlur(a, w, h, r, passes) {
    let src = a, tmp = new Float32Array(w * h);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) { let s = 0, c = 0; const o = y * w;
        for (let x = -r; x < w; x++) { if (x + r < w) { s += src[o + x + r]; c++; } if (x - r - 1 >= 0) { s -= src[o + x - r - 1]; c--; } if (x >= 0) tmp[o + x] = s / c; } }
      const out = new Float32Array(w * h);
      for (let x = 0; x < w; x++) { let s = 0, c = 0;
        for (let y = -r; y < h; y++) { if (y + r < h) { s += tmp[(y + r) * w + x]; c++; } if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * w + x]; c--; } if (y >= 0) out[y * w + x] = s / c; } }
      src = out;
    }
    return src;
  }
  function morph(m, w, h, r, dilate) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h), v = dilate ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let z = 1 - v;
      for (let k = -r; k <= r; k++) { const xx = x + k; const q = xx < 0 || xx >= w ? 1 - v : m[y * w + xx]; if (q === v) { z = v; break; } } t[y * w + x] = z; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let z = 1 - v;
      for (let k = -r; k <= r; k++) { const yy = y + k; const q = yy < 0 || yy >= h ? 1 - v : t[yy * w + x]; if (q === v) { z = v; break; } } o[y * w + x] = z; }
    return o;
  }

  // ---------- tách mảnh ----------
  // rgba: Uint8ClampedArray w*h*4
  function segment(rgba, w, h) {
    const n = w * h, L = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = lin[rgba[4 * i]], g = lin[rgba[4 * i + 1]], b = lin[rgba[4 * i + 2]];
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
      const fy = fl(Y); L[i] = 116 * fy - 16; B[i] = 200 * (fy - fl(Z));
    }
    // nền: làm mờ rất mạnh trên ảnh thu nhỏ
    const f = 8, sw = Math.ceil(w / f), sh = Math.ceil(h / f), sL = new Float32Array(sw * sh), sB = new Float32Array(sw * sh), sc = new Float32Array(sw * sh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = ((y / f) | 0) * sw + ((x / f) | 0), i = y * w + x; sL[j] += L[i]; sB[j] += B[i]; sc[j]++; }
    for (let j = 0; j < sL.length; j++) { sL[j] /= sc[j]; sB[j] /= sc[j]; }
    const rad = Math.max(2, Math.round(Math.max(w, h) / f / 50));
    const bL = boxBlur(sL, sw, sh, rad, 3), bB = boxBlur(sB, sw, sh, rad, 3);
    const bg = (a, x, y) => { const fx = Math.min(sw - 1.001, Math.max(0, x / f - 0.5)), fy = Math.min(sh - 1.001, Math.max(0, y / f - 0.5)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
      return (a[y0 * sw + x0] * (1 - ax) + a[y0 * sw + x0 + 1] * ax) * (1 - ay) + (a[(y0 + 1) * sw + x0] * (1 - ax) + a[(y0 + 1) * sw + x0 + 1] * ax) * ay; };
    // nền trắng cháy (hộp đèn, giấy trắng dư sáng): tắt quy tắc "vùng lóa"
    const Ls = Array.from(sL).sort((a, b) => a - b), bright = Ls[Math.floor(Ls.length * 0.6)] > 92;
    let m = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, gl = bg(bL, x, y), gb = bg(bB, x, y), rl = L[i] / Math.max(gl, 1);
      // mảnh tối trên nền sáng, mảnh sáng trên nền tối, mảnh ánh vàng, vùng lóa
      if (rl < 0.8 || (gl < 45 && rl > 1.3) || B[i] - gb > 5 || (!bright && L[i] > 97.5)) m[i] = 1;
    }
    const k = Math.max(1, Math.round(Math.max(w, h) / 1100));
    m = morph(morph(m, w, h, k, false), w, h, k, true);            // open
    m = morph(morph(m, w, h, 2 * k, true), w, h, 2 * k, false);    // close
    // gán nhãn
    const lab = new Int32Array(n), comps = [], st = new Int32Array(n);
    let id = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!m[s0] || lab[s0]) continue;
      id++; let sp = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, touch = false; st[sp++] = s0; lab[s0] = id;
      while (sp) { const i = st[--sp], x = i % w, y = (i / w) | 0; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
        if (x > 0 && m[i - 1] && !lab[i - 1]) { lab[i - 1] = id; st[sp++] = i - 1; }
        if (x < w - 1 && m[i + 1] && !lab[i + 1]) { lab[i + 1] = id; st[sp++] = i + 1; }
        if (y > 0 && m[i - w] && !lab[i - w]) { lab[i - w] = id; st[sp++] = i - w; }
        if (y < h - 1 && m[i + w] && !lab[i + w]) { lab[i + w] = id; st[sp++] = i + w; } }
      comps.push({ id, area, x0, y0, x1, y1, touch });
    }
    const minA = 0.0004 * n;
    let big = comps.filter(c => c.area >= minA);
    const med = big.map(c => c.area).sort((a, b) => a - b)[big.length >> 1] || 0;
    big = big.filter(c => c.area >= 0.3 * med);
    // mặt nạ cục bộ + lấp lỗ
    return big.map(c => {
      const bw = c.x1 - c.x0 + 3, bh = c.y1 - c.y0 + 3, mk = new Uint8Array(bw * bh);
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * w + x] === c.id) mk[(y - c.y0 + 1) * bw + (x - c.x0 + 1)] = 1;
      const out = new Uint8Array(bw * bh), q = [0]; out[0] = 2;
      while (q.length) { const i = q.pop(), x = i % bw, y = (i / bw) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1, y > 0 ? i - bw : -1, y < bh - 1 ? i + bw : -1]) if (j >= 0 && !mk[j] && !out[j]) { out[j] = 2; q.push(j); } }
      let area = 0, sx = 0, sy = 0;
      for (let i = 0; i < mk.length; i++) { mk[i] = out[i] === 2 ? 0 : 1; if (mk[i]) { area++; sx += i % bw; sy += (i / bw) | 0; } }
      return { ox: c.x0 - 1, oy: c.y0 - 1, w: bw, h: bh, mask: mk, area, cx: sx / area, cy: sy / area, touch: c.touch };
    }).sort((a, b) => (Math.round((a.oy + a.h / 2) / (h / 8)) - Math.round((b.oy + b.h / 2) / (h / 8))) || (a.ox - b.ox));
  }

  // raster mảnh chụp ở góc ang, lật mir, giãn trục y sy
  function rasterPiece(P, N, ang, mir, sy) {
    const W = N >> 5, bits = new Uint32Array(N * W);
    const areaS = P.area * sy, scl = Math.sqrt(areaS) / (N * SC), cy2 = P.cy * sy;
    const t = ang * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const px = u + 0.5 - N / 2, py = v + 0.5 - N / 2;
      let qx = c * px + s * py, qy = -s * px + c * py;
      if (mir) qx = -qx;
      const x = Math.round(qx * scl + P.cx), y = Math.round((qy * scl + cy2) / sy);
      if (x >= 0 && y >= 0 && x < P.w && y < P.h && P.mask[y * P.w + x]) bits[v * W + (u >> 5)] |= 1 << (u & 31);
    }
    return bits;
  }
  function iouAll(lib, v, vc, fine, out) {
    const L = v.length;
    for (let k = 0; k < lib.length; k++) {
      const b = fine ? lib[k].f : lib[k].c; let it = 0;
      for (let i = 0; i < L; i++) it += popcnt(b[i] & v[i]);
      out[k] = it / ((fine ? lib[k].fc : lib[k].cc) + vc - it);
    }
  }

  // so khớp một mảnh: trả về danh sách ứng viên đã xếp hạng
  function matchPiece(P, lib) {
    const n = lib.length, best = new Float32Array(n), tmp = new Float32Array(n);
    for (const sy of [0.92, 1, 1.08]) for (const mir of [false, true]) for (let a = 0; a < 360; a += 4) {
      const v = rasterPiece(P, NC, a, mir, sy); iouAll(lib, v, cnt(v), false, tmp);
      for (let k = 0; k < n; k++) if (tmp[k] > best[k]) best[k] = tmp[k];
    }
    const top = Array.from(best.keys()).sort((a, b) => best[b] - best[a]).slice(0, 12);
    const sub = top.map(k => lib[k]), fb = new Float32Array(sub.length), arg = sub.map(() => null), t2 = new Float32Array(sub.length);
    for (const sy of [0.88, 0.94, 1, 1.06, 1.12]) for (const mir of [false, true]) for (let a = 0; a < 360; a += 2) {
      const v = rasterPiece(P, NF, a, mir, sy); iouAll(sub, v, cnt(v), true, t2);
      for (let k = 0; k < sub.length; k++) if (t2[k] > fb[k]) { fb[k] = t2[k]; arg[k] = { ang: a, mir, sy }; }
    }
    return sub.map((e, k) => ({ num: e.num, iou: fb[k], ratio: (P.aw || P.area) / e.area, mir: arg[k].mir, ang: arg[k].ang, sy: arg[k].sy, e }))
      .sort((a, b) => b.iou - a.iou);
  }

  // tách lại một mảnh ở độ phân giải gốc. full: RGBA ảnh gốc FW×FH; P: mảnh từ ảnh làm việc; F = FW / w
  function refinePiece(full, FW, FH, P, F) {
    const sl = Math.min(F, 110 / Math.sqrt(P.area));
    if (sl < 1.4) return null;
    const mx = P.w * 0.3, my = P.h * 0.3;
    const x0 = Math.max(0, P.ox - mx), y0 = Math.max(0, P.oy - my), x1 = Math.min(FW / F, P.ox + P.w + mx), y1 = Math.min(FH / F, P.oy + P.h + my);
    const w = Math.round((x1 - x0) * sl), h = Math.round((y1 - y0) * sl), n = w * h;
    if (w < 20 || h < 20 || n > 4e6) return null;
    const L = new Float32Array(n), B = new Float32Array(n), k = F / sl;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = Math.min(FW - 1, Math.max(0, (x0 * F) + (x + 0.5) * k - 0.5)), fy = Math.min(FH - 1, Math.max(0, (y0 * F) + (y + 0.5) * k - 0.5));
      const xi = Math.min(FW - 2, fx | 0), yi = Math.min(FH - 2, fy | 0), ax = fx - xi, ay = fy - yi;
      const rgb = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const i00 = 4 * (yi * FW + xi) + c;
        rgb[c] = (full[i00] * (1 - ax) + full[i00 + 4] * ax) * (1 - ay) + (full[i00 + 4 * FW] * (1 - ax) + full[i00 + 4 * FW + 4] * ax) * ay;
      }
      const r = lin[Math.round(rgb[0])], g = lin[Math.round(rgb[1])], b = lin[Math.round(rgb[2])];
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089, fy2 = fl(Y), i = y * w + x;
      L[i] = 116 * fy2 - 16; B[i] = 200 * (fy2 - fl(Z));
    }
    // nền = trung vị viền khung cắt
    const bl = [], bb = [];
    for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) { bl.push(L[y * w + x]); bb.push(B[y * w + x]); }
    for (let y = 2; y < h - 2; y++) for (const x of [0, 1, w - 2, w - 1]) { bl.push(L[y * w + x]); bb.push(B[y * w + x]); }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1], gl = med(bl), gb = med(bb);
    let m = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const rl = L[i] / Math.max(gl, 1);
      if (rl < 0.8 || (gl < 45 && rl > 1.3) || B[i] - gb > 5 || (gl < 88 && L[i] > 97.5)) m[i] = 1; }
    m = morph(morph(m, w, h, 1, false), w, h, 1, true);
    m = morph(morph(m, w, h, 2, true), w, h, 2, false);
    // thành phần lớn nhất chạm vùng trung tâm
    const lab = new Int32Array(n), st = new Int32Array(n); let id = 0, bestId = 0, bestA = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!m[s0] || lab[s0]) continue; id++; let sp = 0, a = 0, cen = false; st[sp++] = s0; lab[s0] = id;
      while (sp) { const i = st[--sp], x = i % w, y = (i / w) | 0; a++;
        if (Math.abs(x - w / 2) < w * 0.2 && Math.abs(y - h / 2) < h * 0.2) cen = true;
        if (x > 0 && m[i - 1] && !lab[i - 1]) { lab[i - 1] = id; st[sp++] = i - 1; }
        if (x < w - 1 && m[i + 1] && !lab[i + 1]) { lab[i + 1] = id; st[sp++] = i + 1; }
        if (y > 0 && m[i - w] && !lab[i - w]) { lab[i - w] = id; st[sp++] = i - w; }
        if (y < h - 1 && m[i + w] && !lab[i + w]) { lab[i + w] = id; st[sp++] = i + w; } }
      if (cen && a > bestA) { bestA = a; bestId = id; }
    }
    if (!bestId) return null;
    const mk = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (lab[i] === bestId) mk[i] = 1;
    // lấp lỗ: loang nền từ viền
    const out = new Uint8Array(n), q = [];
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!mk[i] && !out[i]) { out[i] = 1; q.push(i); } }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!mk[i] && !out[i]) { out[i] = 1; q.push(i); } }
    while (q.length) { const i = q.pop(), x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !mk[j] && !out[j]) { out[j] = 1; q.push(j); } }
    let area = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { mk[i] = out[i] ? 0 : 1; if (mk[i]) { area++; sx += i % w; sy += (i / w) | 0; } }
    const aw = area / (sl * sl);
    if (aw < P.area * 0.6 || aw > P.area * 1.6) return null;   // tách lại hỏng → dùng bản thô
    return { w, h, mask: mk, area, cx: sx / area, cy: sy / area, aw, touch: P.touch };
  }

  // hậu xử lý: ước lượng tỷ lệ diện tích chung, xếp hạng lại, và (tuỳ chọn) mỗi số chỉ dùng 1 lần
  function finalize(results, unique) {
    const conf = results.filter(r => r.cands[0] && r.cands[0].iou >= 0.8 && r.cands[0].iou - r.cands[1].iou >= 0.1).map(r => r.cands[0].ratio).sort((a, b) => a - b);
    const k = conf.length >= 2 ? conf[conf.length >> 1] : null;
    for (const r of results) {
      for (const c of r.cands) { c.dev = k ? Math.abs(Math.log(c.ratio / k)) : 0; c.score = c.iou - 0.5 * c.dev; }
      r.cands.sort((a, b) => b.score - a.score);
      r.taken = null;
    }
    if (unique) {
      const pairs = [];
      results.forEach((r, ri) => { if (!r.touch) r.cands.forEach(c => pairs.push([c.score, ri, c])); });
      pairs.sort((a, b) => b[0] - a[0]);
      const used = new Set(), done = new Set();
      for (const [, ri, c] of pairs) { if (done.has(ri) || used.has(c.num)) continue; used.add(c.num); done.add(ri); results[ri].taken = c; }
      for (const r of results) { if (!r.taken) continue; const t = r.taken; r.cands = [t, ...r.cands.filter(c => c !== t)]; }
    }
    for (const r of results) {
      const a = r.cands[0], b = r.cands[1] || { score: 0 }, lowres = (r.res || 99) < 45;
      // khi ép duy nhất: so với ứng viên kế tiếp của chính mảnh này
      const margin = a.score - b.score;
      let st = (((a.iou >= 0.78 && margin >= 0.08) || (a.iou >= 0.72 && margin >= 0.15)) && a.dev < 0.18) ? 'ok' : (a.iou >= 0.68 && a.dev < 0.25) ? 'maybe' : 'none';
      if (st === 'ok' && lowres) st = 'maybe';
      r.status = r.touch ? 'edge' : st;
    }
    return k;
  }

  const api = { buildLibrary, segment, refinePiece, matchPiece, finalize, rasterPiece, NF };
  if (typeof module !== 'undefined') module.exports = api; else root.PuzzleCore = api;
})(this);
