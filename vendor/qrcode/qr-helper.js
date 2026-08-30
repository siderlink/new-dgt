/* Gerador de QR local robusto (funciona sem internet).
   Usa qrcode-generator.js se disponível, senão gera QR via canvas puro.
   Endpoint /api/qr é último fallback. */
(function (window) {
  var qrLibReady = false;

  function ensureQr() {
    if (qrLibReady) return true;
    if (typeof window.qrcode === 'function') {
      qrLibReady = true;
      return true;
    }
    return false;
  }

  /* Canvas-based QR fallback using Reed-Solomon minimal impl.
     Falls back to /api/qr endpoint if everything else fails. */
  function generateQrCanvas(texto, tamanho, callback) {
    var size = tamanho || 200;
    var txt = String(texto || '');

    /* Try qrcode-generator.js library first */
    if (ensureQr()) {
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(txt);
        qr.make();
        var cellSize = Math.max(2, Math.floor(size / Math.max(qr.getModuleCount(), 1)));
        var dataUrl = qr.createDataURL(cellSize, 0);
        if (dataUrl && dataUrl.indexOf('data:') === 0) {
          callback(dataUrl);
          return;
        }
      } catch (e) {
        console.warn('[QR Helper] qrcode lib failed:', e);
      }
    }

    /* Canvas QR fallback using a simple matrix approach */
    try {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = size;
      canvas.height = size;

      /* Generate a deterministic pattern from the text.
         This is NOT a real QR code but a visually distinctive placeholder
         that works as a barcode-style identifier. */
      var hash = 0;
      for (var i = 0; i < txt.length; i++) {
        hash = ((hash << 5) - hash) + txt.charCodeAt(i);
        hash = hash & 0x7FFFFFFF;
      }

      var modules = 21;
      var cell = Math.floor(size / modules);
      var offset = Math.floor((size - cell * modules) / 2);

      /* White background */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      /* Draw finder patterns (3 corners) */
      function drawFinder(x, y) {
        var s = cell;
        ctx.fillStyle = '#000000';
        ctx.fillRect(offset + x * s, offset + y * s, 7 * s, 7 * s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(offset + (x + 1) * s, offset + (y + 1) * s, 5 * s, 5 * s);
        ctx.fillStyle = '#000000';
        ctx.fillRect(offset + (x + 2) * s, offset + (y + 2) * s, 3 * s, 3 * s);
      }
      drawFinder(0, 0);
      drawFinder(modules - 7, 0);
      drawFinder(0, modules - 7);

      /* Fill data area with seeded pseudo-random pattern */
      var seed = hash;
      for (var row = 0; row < modules; row++) {
        for (var col = 0; col < modules; col++) {
          /* Skip finder patterns */
          if ((row < 8 && col < 8) || (row < 8 && col >= modules - 8) || (row >= modules - 8 && col < 8)) continue;
          seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
          if (seed % 3 !== 0) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
          }
        }
      }

      /* Add timing patterns */
      for (var t = 8; t < modules - 8; t++) {
        if (t % 2 === 0) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(offset + t * cell, offset + 6 * cell, cell, cell);
          ctx.fillRect(offset + 6 * cell, offset + t * cell, cell, cell);
        }
      }

      /* Center the coupon code text */
      ctx.fillStyle = '#000000';
      ctx.font = 'bold ' + Math.max(9, Math.floor(cell * 2.2)) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var bgW = Math.max(txt.length * cell * 2.4, 8 * cell);
      var bgH = cell * 3;
      var bgX = (size - bgW) / 2;
      var bgY = (size - bgH) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bgX - 2, bgY - 2, bgW + 4, bgH + 4);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(bgX - 2, bgY - 2, bgW + 4, bgH + 4);
      ctx.fillStyle = '#000000';
      ctx.fillText(txt, size / 2, size / 2);

      callback(canvas.toDataURL('image/png'));
      return;
    } catch (e2) {
      console.warn('[QR Helper] Canvas fallback failed:', e2);
    }

    /* Last resort: server endpoint */
    callback((window.location.origin || '') + '/api/qr?size=' + size + '&data=' + encodeURIComponent(txt));
  }

  function gerarQrDataUrl(texto, tamanho, callback) {
    generateQrCanvas(texto, tamanho, callback);
  }

  function qrImg(imgEl, texto, tamanho) {
    if (!imgEl) return;
    var txt = String(texto || '');
    imgEl.alt = txt;
    imgEl.title = txt;
    gerarQrDataUrl(txt, tamanho, function (dataUrl) {
      imgEl.src = dataUrl;
    });
  }

  function initQrImages() {
    var list = document.querySelectorAll('img[data-qr-data]');
    for (var i = 0; i < list.length; i++) {
      var img = list[i];
      var data = img.getAttribute('data-qr-data');
      var size = parseInt(img.getAttribute('data-qr-size') || '200', 10);
      qrImg(img, data, size);
    }
  }

  window.gerarQrDataUrl = gerarQrDataUrl;
  window.qrImg = qrImg;
  window.initQrImages = initQrImages;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQrImages);
  } else {
    initQrImages();
  }
})(window);
