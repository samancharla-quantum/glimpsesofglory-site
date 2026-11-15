/* Glimpses of Glory: custom-piece request form (custom.html).
   Category choice (not a specific shop design). Posts to window.GOG_CUSTOM.endpoint. */
(function () {
  var CFG = window.GOG_CUSTOM || {};
  var ENDPOINT = CFG.endpoint || '/mock-custom';
  var MAX_BYTES = CFG.maxImageBytes || (10 * 1024 * 1024);
  var CATEGORIES = [
    { id:'coaster-round',  label:'Custom Coaster (Round)',  aliases:['coaster-round','round-coaster','round','cord'] },
    { id:'coaster-square', label:'Custom Coaster (Square)', aliases:['coaster-square','square-coaster','square','cosq'] },
    { id:'tumbler',        label:'Custom Tumbler',          aliases:['tumbler','tumblers'] },
    { id:'cutting-board',  label:'Custom Cutting Board',    aliases:['cutting-board','cutting-boards','glass-cutting-boards','cuttingboard'] },
    { id:'greeting-card',  label:'Custom Greeting Card',    aliases:['greeting-card','greeting-cards','cards','card'] },
    { id:'gift',           label:'Custom Gift',             aliases:['gift','gifts','gifts-and-more','gifts-more','misc'] },
    { id:'other',          label:"Other / I'm not sure",    aliases:['other','not-sure','unsure'] }
  ];
  var STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],
    ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
    ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],
    ['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],
    ['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],
    ['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
    ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
    ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],
    ['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
  ];

  var form = document.getElementById('custom-form');
  if (!form) return;
  var categorySel = document.getElementById('category');
  var imageInput = document.getElementById('image');
  var imageMeta = document.getElementById('image-meta');
  var imagePreview = document.getElementById('image-preview');
  var imageInfo = document.getElementById('image-info');
  var imagePixels = document.getElementById('image-pixels');
  var errBox = document.getElementById('custom-err');
  var submitBtn = document.getElementById('custom-submit');
  var pendingImage = null;

  function param(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function fillStates() {
    var sel = document.getElementById('state');
    STATES.forEach(function (pair) {
      var o = document.createElement('option');
      o.value = pair[0]; o.textContent = pair[0];
      o.setAttribute('title', pair[1]);
      sel.appendChild(o);
    });
  }
  function slug(s) {
    return String(s || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function findCategory(raw) {
    var key = slug(raw);
    if (!key) return null;
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      if (c.id === key || slug(c.label) === key) return c;
      for (var j = 0; j < c.aliases.length; j++) if (c.aliases[j] === key) return c;
    }
    return null;
  }
  function preselectCategory() {
    var raw = param('category') || param('c') || '';
    var match = findCategory(raw);
    if (!match) return;
    categorySel.value = match.id;
    var banner = document.getElementById('custom-preselect');
    banner.textContent = 'Customizing: ' + match.label;
    banner.hidden = false;
  }
  function selectedCategory() {
    var id = categorySel.value;
    if (!id) return null;
    var o = categorySel.options[categorySel.selectedIndex];
    return { id: id, label: (o && o.textContent) ? o.textContent.trim() : id };
  }

  function setColor(hex, fromSwatch) {
    hex = String(hex || '').trim();
    if (/^#?[0-9a-f]{3}$/i.test(hex)) {
      hex = hex[0] === '#' ? hex : ('#' + hex);
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) hex = '#' + hex;
    document.getElementById('textColor').value = hex;
    if (/^#[0-9a-f]{6}$/i.test(hex)) document.getElementById('textColorPicker').value = hex;
    [].slice.call(document.querySelectorAll('.swatch')).forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-color').toLowerCase() === hex.toLowerCase() ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.swatch').forEach(function (b) {
    b.addEventListener('click', function () { setColor(b.getAttribute('data-color'), true); });
  });
  document.getElementById('textColorPicker').addEventListener('input', function (e) { setColor(e.target.value, false); });
  document.getElementById('textColor').addEventListener('change', function (e) { setColor(e.target.value, false); });
  setColor('#3d2c4e', true);

  function clearImage() {
    pendingImage = null;
    imageInput.value = '';
    imagePreview.removeAttribute('src');
    imageMeta.hidden = true;
    imagePixels.textContent = '';
    imageInfo.textContent = '';
  }

  document.getElementById('image-clear').addEventListener('click', clearImage);

  function humanSize(n) {
    if (n < 1024) return n + ' bytes';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || '');
        var comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      fr.onerror = function () { reject(new Error('Could not read that photo.')); };
      fr.readAsDataURL(file);
    });
  }

  function readDimensions(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = function () { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
      img.src = url;
    });
  }

  imageInput.addEventListener('change', function () {
    var file = imageInput.files && imageInput.files[0];
    if (!file) { clearImage(); return; }
    if (file.size > MAX_BYTES) {
      clearImage();
      showErr('That photo is ' + humanSize(file.size) + '. Please send a file under 10 MB.');
      return;
    }
    showErr('');
    Promise.all([readFileAsBase64(file), readDimensions(file)]).then(function (parts) {
      var dims = parts[1];
      pendingImage = {
        filename: file.name || 'photo.jpg',
        mimeType: file.type || 'application/octet-stream',
        data: parts[0],
        width: dims.width || 0,
        height: dims.height || 0,
        bytes: file.size
      };
      imagePreview.src = URL.createObjectURL(file);
      imageInfo.textContent = (file.name || 'Photo') + '  ·  ' + humanSize(file.size);
      if (dims.width && dims.height) {
        imagePixels.textContent = 'This photo is ' + dims.width.toLocaleString() + ' \u00d7 ' + dims.height.toLocaleString() + ' pixels.';
      } else {
        imagePixels.textContent = 'We couldn\u2019t read the pixel size of this file, but you can still send it.';
      }
      imageMeta.hidden = false;
    }).catch(function (e) {
      clearImage();
      showErr(e.message || 'Could not read that photo.');
    });
  });

  function showErr(msg) {
    if (!msg) { errBox.hidden = true; errBox.textContent = ''; return; }
    errBox.hidden = false; errBox.textContent = msg;
  }

  function mark(el, bad) { if (el) el.classList.toggle('invalid', !!bad); }

  function val(id) { return (document.getElementById(id).value || '').trim(); }


  function chosenRadio(name) {
    var n = document.querySelector('input[name="' + name + '"]:checked');
    return n ? n.value : '';
  }

  function updateAddressField() {
    var wrap = document.getElementById('address-wrap');
    wrap.hidden = chosenRadio('delivery') !== 'Ship';
  }

  function validate() {
    var errors = [];
    function need(id, ok, msg) { mark(document.getElementById(id), !ok); if (!ok) errors.push(msg); }

    var cat = selectedCategory();
    need('category', !!cat, 'Please choose a category.');

    var desc = val('imageDesc');
    var hasImage = !!(pendingImage && pendingImage.data);
    mark(document.getElementById('imageDesc'), !hasImage && !desc);
    if (!hasImage && !desc) errors.push('Please attach a background image or describe the image you have in mind.');

    mark(document.getElementById('text1'), false);
    mark(document.getElementById('text2'), false);
    mark(document.getElementById('text3'), false);

    var qty = parseInt(val('quantity'), 10);
    need('quantity', qty >= 1 && qty <= 99, 'Quantity should be between 1 and 99.');

    var delivery = chosenRadio('delivery');
    if (!delivery) errors.push('Please choose shipping or pickup.');

    need('name', val('name').length >= 2, 'Please enter your name.');
    need('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email')), 'Please enter a valid email address.');
    var digits = val('phone').replace(/\D/g, '');
    need('phone', digits.length >= 7, 'Please enter a phone number.');

    if (delivery === 'Ship') {
      need('street', val('street').length >= 3, 'Please enter a street address.');
      need('city', val('city').length >= 2, 'Please enter a city.');
      need('state', !!val('state'), 'Please choose a state.');
      need('zip', /^\d{5}(-\d{4})?$/.test(val('zip')), 'Please enter a 5-digit ZIP code.');
    } else {
      mark(document.getElementById('street'), false);
      mark(document.getElementById('city'), false);
      mark(document.getElementById('state'), false);
      mark(document.getElementById('zip'), false);
    }

    if (val('website')) errors.push('Skipped.');
    return errors;
  }

  function payload() {
    var cat = selectedCategory() || { id: '', label: '' };
    var delivery = chosenRadio('delivery');
    var shipping = delivery === 'Ship';
    var body = {
      category: cat.id,
      categoryLabel: cat.label,
      delivery: delivery,
      imageDescription: val('imageDesc'),
      text1: val('text1'),
      text2: val('text2'),
      text3: val('text3'),
      textColor: val('textColor'),
      quantity: parseInt(val('quantity'), 10) || 1,
      name: val('name'),
      email: val('email'),
      phone: val('phone'),
      street: shipping ? val('street') : '',
      city: shipping ? val('city') : '',
      state: shipping ? val('state') : '',
      zip: shipping ? val('zip') : '',
      notes: val('notes'),
      neededBy: val('neededBy'),
      website: val('website')
    };
    if (pendingImage) {
      body.image = {
        filename: pendingImage.filename,
        mimeType: pendingImage.mimeType,
        data: pendingImage.data,
        width: pendingImage.width,
        height: pendingImage.height
      };
    }
    return body;
  }

  function submitViaIframe(url, body) {
    return new Promise(function (resolve, reject) {
      var frameName = 'gog-custom-frame';
      var old = document.querySelector('iframe[name="' + frameName + '"]');
      if (old) old.remove();
      var iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.title = 'Submitting your request';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      var hidden = document.createElement('form');
      hidden.method = 'POST';
      hidden.action = url;
      hidden.target = frameName;
      hidden.style.display = 'none';
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(body);
      hidden.appendChild(input);
      var flag = document.createElement('input');
      flag.type = 'hidden'; flag.name = 'iframe'; flag.value = '1';
      hidden.appendChild(flag);
      document.body.appendChild(hidden);

      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('That took too long. Please try again, or email us at hello@glimpsesofglory.shop.'));
      }, 90000);

      function onMsg(e) {
        var origin = String(e.origin || '');
        if (origin && origin !== 'null' && !/script\.google\.com$/.test(origin) && origin.indexOf('googleusercontent.com') < 0) return;
        var data = e.data || {};
        if (data.source !== 'gog-custom' || !data.result) return;
        cleanup();
        if (data.result.ok) resolve(data.result);
        else reject(new Error(data.result.error || 'Your request could not be sent.'));
      }
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        hidden.remove();
        setTimeout(function () { iframe.remove(); }, 500);
      }
      window.addEventListener('message', onMsg);
      hidden.submit();
    });
  }

  function submitRequest(body) {
    if (/script\.google\.com/i.test(ENDPOINT)) return submitViaIframe(ENDPOINT, body);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = {};
        try { data = t ? JSON.parse(t) : {}; } catch (e) { throw new Error('The request service returned an unexpected response.'); }
        if (!r.ok || !data.ok) throw new Error(data.error || 'Your request could not be sent.');
        return data;
      });
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var errors = validate();
    if (errors.length) {
      showErr(errors[0] === 'Skipped.' ? '' : errors[0]);
      if (errors[0] !== 'Skipped.') form.querySelector('.invalid') && form.querySelector('.invalid').focus();
      return;
    }
    showErr('');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending\u2026';
    submitRequest(payload()).then(function (data) {
      form.hidden = true;
      var intro = document.querySelector('.pagehead .intro');
      if (intro) intro.hidden = true;
      var success = document.getElementById('custom-success');
      success.hidden = false;
      var id = data.requestId || '';
      document.getElementById('success-id').textContent = id;
      document.getElementById('success-id-wrap').hidden = !id;
      success.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
      showErr(err.message || 'Something went wrong. Please try again, or email hello@glimpsesofglory.shop.');
    });
  });

  var needed = document.getElementById('neededBy');
  try {
    var today = new Date();
    var m = String(today.getMonth() + 1).padStart(2, '0');
    var d = String(today.getDate()).padStart(2, '0');
    needed.min = today.getFullYear() + '-' + m + '-' + d;
  } catch (e) {}

  [].slice.call(document.querySelectorAll('input[name="delivery"]')).forEach(function (n) {
    n.addEventListener('change', updateAddressField);
  });
  fillStates();
  preselectCategory();
})();
