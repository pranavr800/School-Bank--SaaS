// ─── DIGITAL ID CARD — Canvas Bank Card Generator ─────────────────
// Draws a portrait-style school ID badge (540×860) onto a <canvas>.
// Depends on: DB, STATE, currentStudentId, initials(), QRCode (lib)

// ── Canvas helper: rounded rectangle path ────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── EMV-style chip decoration ─────────────────────────────────────
function drawChip(ctx, x, y) {
  const cw = 52, ch = 40;
  ctx.save();
  const gChip = ctx.createLinearGradient(x, y, x + cw, y + ch);
  gChip.addColorStop(0,   '#c8961a');
  gChip.addColorStop(0.4, '#f0d060');
  gChip.addColorStop(0.7, '#c8961a');
  gChip.addColorStop(1,   '#a07010');
  roundRect(ctx, x, y, cw, ch, 6);
  ctx.fillStyle = gChip;
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,70,0,0.35)';
  ctx.lineWidth   = 1;
  [8, 16, 24, 32].forEach(dy => {
    ctx.beginPath(); ctx.moveTo(x + 4, y + dy); ctx.lineTo(x + cw - 4, y + dy); ctx.stroke();
  });
  ctx.beginPath(); ctx.moveTo(x + 18, y + 4);      ctx.lineTo(x + 18, y + ch - 4);      ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + cw - 18, y + 4); ctx.lineTo(x + cw - 18, y + ch - 4); ctx.stroke();
  roundRect(ctx, x + 18, y + 10, cw - 36, ch - 20, 3);
  ctx.strokeStyle = 'rgba(100,70,0,0.5)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();
}

// ── Contactless payment arcs ──────────────────────────────────────
function drawContactless(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  [0, 1, 2].forEach(i => {
    const r = 12 + i * 9;
    ctx.lineWidth = 1.8 - i * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();
  });
  ctx.restore();
}

// ── QR code drawn onto the card canvas ───────────────────────────
// Uses QRCode.js (already loaded via CDN) to render into a hidden div,
// then copies the result onto the canvas. Returns a Promise.
function drawQROnCard(ctx, accNum, x, y, size) {
  return new Promise(resolve => {
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(tmp);
    try {
      new QRCode(tmp, {
        text:         accNum,
        width:        size,
        height:       size,
        colorDark:    '#0f2744',
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      setTimeout(() => {
        const img = tmp.querySelector('img') || tmp.querySelector('canvas');
        if (img) {
          // White background box
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 8);
          ctx.fill();
          if (img.tagName === 'CANVAS') {
            ctx.drawImage(img, x, y, size, size);
          } else {
            const i2    = new Image();
            i2.onload   = () => { ctx.drawImage(i2, x, y, size, size); document.body.removeChild(tmp); resolve(); };
            i2.onerror  = () => { document.body.removeChild(tmp); resolve(); };
            i2.src      = img.src;
            return;
          }
        }
        document.body.removeChild(tmp);
        resolve();
      }, 120);
    } catch (e) {
      document.body.removeChild(tmp);
      resolve();
    }
  });
}

// ── Student photo circle ──────────────────────────────────────────
function drawPhotoCircle(ctx, photoUrl, cx, cy, r) {
  return new Promise(resolve => {
    ctx.save();
    ctx.strokeStyle = '#c8961a';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();

    if (photoUrl) {
      const img       = new Image();
      img.crossOrigin = 'anonymous';
      img.onload      = () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
        resolve();
      };
      img.onerror = () => { drawAvatarFallback(ctx, cx, cy, r); resolve(); };
      img.src     = photoUrl;
    } else {
      drawAvatarFallback(ctx, cx, cy, r);
      resolve();
    }
    ctx.restore();
  });
}

// ── Initials fallback when no photo ──────────────────────────────
function drawAvatarFallback(ctx, cx, cy, r) {
  const s     = DB.getStudentById(currentStudentId);
  const inits = s ? initials(s.name) : '?';
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.fillStyle    = 'rgba(255,255,255,0.85)';
  ctx.font         = `600 ${r * 0.7}px Fraunces, serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(inits, cx, cy + 2);
  ctx.restore();
}

// ── KYC badge pill ────────────────────────────────────────────────
function drawKycBadge(ctx, x, y, verified) {
  ctx.save();
  const label = verified ? '✓ KYC Verified' : '⚠ Unverified';
  const bg    = verified ? 'rgba(26,122,74,0.85)' : 'rgba(180,83,9,0.85)';
  const tw    = verified ? 108 : 90;
  roundRect(ctx, x, y, tw, 22, 11);
  ctx.fillStyle    = bg;
  ctx.fill();
  ctx.fillStyle    = '#ffffff';
  ctx.font         = '500 11px Nunito, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + tw / 2, y + 11);
  ctx.restore();
}

// ── Main card draw function ───────────────────────────────────────
// Called by renderIDCard() in views.js after confirming the student exists.
async function drawIDCard(canvas, s) {
  const ctx = canvas.getContext('2d');
  const W   = 540, H = 860;
  canvas.width  = W;
  canvas.height = H;

  // ── 1. Background ─────────────────────────────────────
  roundRect(ctx, 0, 0, W, H, 28);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    '#0D2240');
  bg.addColorStop(0.55, '#162F56');
  bg.addColorStop(1,    '#0A1A30');
  ctx.fillStyle = bg;
  ctx.fill();

  // Dot grid texture
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 20; x < W; x += 22) {
    for (let y = 20; y < H; y += 22) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Large soft circle — top-right accent
  ctx.strokeStyle = 'rgba(200,136,42,0.1)';
  ctx.lineWidth   = 48;
  ctx.beginPath();
  ctx.arc(W + 40, -40, 220, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ── 2. Gold header band ───────────────────────────────
  const hBand = ctx.createLinearGradient(0, 0, W, 0);
  hBand.addColorStop(0,   'rgba(200,136,42,0.18)');
  hBand.addColorStop(0.5, 'rgba(200,136,42,0.32)');
  hBand.addColorStop(1,   'rgba(200,136,42,0.12)');
  ctx.fillStyle = hBand;
  ctx.fillRect(0, 0, W, 90);

  // Gold top border line
  const gLine = ctx.createLinearGradient(0, 0, W, 0);
  gLine.addColorStop(0,   'rgba(200,136,42,0)');
  gLine.addColorStop(0.3, 'rgba(240,180,60,0.9)');
  gLine.addColorStop(0.7, 'rgba(240,180,60,0.9)');
  gLine.addColorStop(1,   'rgba(200,136,42,0)');
  ctx.fillStyle = gLine;
  ctx.fillRect(0, 0, W, 3);

  // ── 3. Header text ────────────────────────────────────
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = '#f0d060';
  ctx.font         = '700 13px Nunito, sans-serif';
  ctx.fillText('STUDENT SAVINGS BANK', W / 2, 18);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font      = '800 22px Fraunces, serif';
  ctx.fillText((STATE.schoolName || 'School').toUpperCase(), W / 2, 38);

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font      = '600 11px Nunito, sans-serif';
  ctx.fillText('SCHOOL CODE: ' + (STATE.schoolCode || ''), W / 2, 68);

  // ── 4. Photo ──────────────────────────────────────────
  const photoR  = 68;
  const photoCX = W / 2;
  const photoCY = 120 + photoR;

  // Outer glow ring
  ctx.save();
  ctx.shadowColor = 'rgba(200,136,42,0.35)';
  ctx.shadowBlur  = 16;
  ctx.strokeStyle = '#c8881a';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  await drawPhotoCircle(ctx, s.photo || null, photoCX, photoCY, photoR);

  // KYC tick on photo
  const kycR = 18;
  const kycX = photoCX + photoR * 0.72;
  const kycY = photoCY + photoR * 0.72;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = s.kycVerified ? '#1a7a52' : '#b45309';
  ctx.beginPath();
  ctx.arc(kycX, kycY, kycR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle    = '#fff';
  ctx.font         = '700 14px Nunito, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.kycVerified ? '✓' : '!', kycX, kycY + 1);

  // ── 5. Student name ───────────────────────────────────
  const nameY       = photoCY + photoR + 26;
  const nameDisplay = (s.name || '').length > 18 ? (s.name || '').slice(0, 18) + '…' : (s.name || '');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = '#ffffff';
  ctx.font         = '700 30px Fraunces, serif';
  ctx.fillText(nameDisplay, W / 2, nameY);

  // ── 6. Info pills — Class + Roll ──────────────────────
  const pillY      = nameY + 48;
  const pillW      = 130, pillH = 44, pillGap = 16;
  const pills      = [
    { label: 'CLASS', value: s.class      || '—' },
    { label: 'ROLL',  value: s.rollNumber || '—' },
  ];
  const pillsTotal = pills.length * pillW + (pills.length - 1) * pillGap;
  let px           = (W - pillsTotal) / 2;

  pills.forEach(p => {
    roundRect(ctx, px, pillY, pillW, pillH, 10);
    ctx.fillStyle   = 'rgba(255,255,255,0.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = 'rgba(255,255,255,0.45)';
    ctx.font         = '600 9px Nunito, sans-serif';
    ctx.fillText(p.label, px + pillW / 2, pillY + 8);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font      = '700 16px Nunito, sans-serif';
    ctx.fillText(String(p.value).toUpperCase(), px + pillW / 2, pillY + 20);

    px += pillW + pillGap;
  });

  // ── 7. Account number ─────────────────────────────────
  const accY   = pillY + pillH + 26;
  const accRaw = s.accountNumber || '';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(255,255,255,0.38)';
  ctx.font         = '600 10px Nunito, sans-serif';
  ctx.fillText('ACCOUNT NUMBER', W / 2, accY);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font      = '600 20px "Courier New", monospace';
  ctx.fillText(accRaw.toUpperCase(), W / 2, accY + 16);

  // ── 8. Divider ────────────────────────────────────────
  const divY    = accY + 54;
  const divGrad = ctx.createLinearGradient(40, 0, W - 40, 0);
  divGrad.addColorStop(0,   'rgba(255,255,255,0)');
  divGrad.addColorStop(0.3, 'rgba(255,255,255,0.15)');
  divGrad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  divGrad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(40, divY, W - 80, 1);

  // ── 9. QR code ────────────────────────────────────────
  const qrSize = 160;
  const qrX    = (W - qrSize) / 2;
  const qrY    = divY + 22;
  await drawQROnCard(ctx, accRaw || s.id, qrX, qrY, qrSize);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(255,255,255,0.38)';
  ctx.font         = '600 10px Nunito, sans-serif';
  ctx.fillText('SCAN TO OPEN ACCOUNT', W / 2, qrY + qrSize + 16);

  // ── 10. Footer — academic year strip ─────────────────
  const yr    = new Date().getFullYear();
  const footY = H - 64;

  ctx.fillStyle = 'rgba(200,136,42,0.1)';
  ctx.fillRect(0, footY - 10, W, 74);

  ctx.fillStyle = divGrad;
  ctx.fillRect(0, footY - 11, W, 1);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(255,255,255,0.45)';
  ctx.font         = '600 10px Nunito, sans-serif';
  ctx.fillText('VALID FOR ACADEMIC YEAR', W / 2, footY + 4);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font      = '700 16px Nunito, sans-serif';
  ctx.fillText(`${yr} – ${yr + 1}`, W / 2, footY + 20);

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font      = '500 10px Nunito, sans-serif';
  ctx.fillText(s.kycVerified ? '● KYC VERIFIED' : '○ PENDING KYC', W / 2, footY + 42);
}

// ── Download card as PNG ──────────────────────────────────────────
function downloadIDCard() {
  const canvas = document.getElementById('id-card-canvas');
  const s      = DB.getStudentById(currentStudentId);
  if (!s) return;
  const link      = document.createElement('a');
  link.download   = `IDCard_${s.accountNumber}_${s.name.replace(/\s+/g, '_')}.png`;
  link.href       = canvas.toDataURL('image/png');
  link.click();
  showToast('ID Card downloaded!', 'success');
}

// ── Share or open card ────────────────────────────────────────────
function shareIDCard() {
  const canvas = document.getElementById('id-card-canvas');
  const s      = DB.getStudentById(currentStudentId);
  if (!s) return;
  canvas.toBlob(blob => {
    const file = new File([blob], `IDCard_${s.accountNumber}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        title: `${s.name} — Student ID Card`,
        text:  `Student Bank ID Card\n${s.name} | A/C: ${s.accountNumber} | ${STATE.schoolName}`,
        files: [file],
      }).catch(() => showToast('Share cancelled', ''));
    } else {
      // Fallback — open in new tab, user can long-press to save on mobile
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      showToast('Card opened — long press to save', 'success');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }, 'image/png');
}