'use strict';

/**
 * Gallery Page Template — EasyFind Search
 *
 * Renders a server-side HTML page for a property.
 * Visual reference: EasyFind_Search_Gallery_Mockup_v2.html
 * Design: warm paper + deep garden-green, Fraunces serif for prices.
 *
 * All user-sourced values are HTML-escaped before insertion.
 */

const { config } = require('../config/config');

const CUSTOMER_WA = config.customerWhatsappNumber || '919148338801';

function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(rent) {
  const n = parseFloat(String(rent || '').replace(/[₹,\s]/g, ''));
  if (isNaN(n)) return '';
  return `₹${n.toLocaleString('en-IN')}`;
}

function renderFact(label, value) {
  if (!value || value === 'undefined' || value === 'NaN') return '';
  return `
    <div class="fact">
      <div class="k">${esc(label)}</div>
      <div class="v">${esc(value)}</div>
    </div>`;
}

function renderTag(value) {
  if (!value) return '';
  return `<span class="tag">${esc(value)}</span>`;
}

function renderThumb(url, idx) {
  return `<img src="${esc(url)}" alt="Property photo ${idx + 1}" loading="lazy">`;
}

function renderSimilarCard(prop) {
  const { data } = prop;
  const pid = data.pid || '';
  const cover = (data._imageList || [])[0] || '';
  const rent = fmt(data.rent);
  const bhk = data.bhk || '';
  const loc = data.location || '';
  const galleryUrl = `${config.publicBaseUrl}/api/gallery/${encodeURIComponent(pid)}`;
  return `
    <a href="${esc(galleryUrl)}" class="r-card">
      ${cover ? `<img src="${esc(cover)}" alt="${esc(bhk)} · ${esc(loc)}" loading="lazy">` : '<div class="r-card-no-img"></div>'}
      <div class="rb">
        <div class="rp">${esc(rent)}/mo</div>
        <div class="rl">${esc(bhk)} · ${esc(loc)}</div>
      </div>
    </a>`;
}

/**
 * Render the full gallery page HTML.
 * @param {{ rowIndex: number, data: Object }} prop
 * @param {Array<{ rowIndex: number, data: Object }>} similar — up to 3 similar properties
 * @returns {string} complete HTML document
 */
function renderGallery(prop, similar) {
  const d = prop.data;
  const pid = d.pid || '';
  const images = d._imageList || [];
  const videos = d._videoList || [];
  const cover = images[0] || '';

  const rentFmt = fmt(d.rent);
  const maintenanceFmt = d.maintenance ? fmt(d.maintenance) : null;
  const depositFmt = d.deposit ? fmt(d.deposit) : null;

  const subLine = [d.maintenance ? `+ ${maintenanceFmt} maintenance` : '', d.deposit ? `${depositFmt} deposit` : '']
    .filter(Boolean).join(' · ');

  const title = [d.furnishing, d.bhk].filter(Boolean).join(' ') || d.bhk || 'Property';
  const subtitle = [d.societyName, d.location, 'Bangalore'].filter(Boolean).join(' · ');

  const thumbs = images.slice(0, 5).map((u, i) => renderThumb(u, i)).join('');

  // Facts grid — only show fields that have real values
  const facts = [
    renderFact('Configuration', d.bhk),
    renderFact('Bathrooms', d.bathrooms),
    renderFact('Balcony', d.balcony),
    renderFact('Size', d.size ? `${d.size} sqft` : null),
    renderFact('Floor', d.floor),
    renderFact('Furnishing', d.furnishing),
    renderFact('Tenant', d.tenantType),
    renderFact('Pets', d.petsFriendly),
    renderFact('Available from', d._availabilityDisplay || d.availableFrom),
    renderFact('Maintenance', maintenanceFmt || null),
    renderFact('Deposit', depositFmt || null),
    renderFact('Negotiation', d.negotiation),
    renderFact('Visit timings', d.visitTimings),
  ].filter(Boolean).join('');

  // Tags from amenities
  const tags = [
    d.apartmentType ? renderTag(d.apartmentType) : '',
    d.utility ? renderTag('Utility area') : '',
    d.petsFriendly && (d.petsFriendly.toLowerCase().includes('yes') || d.petsFriendly.toLowerCase().includes('allowed'))
      ? renderTag('Pets allowed') : '',
    d.tenantType ? renderTag(d.tenantType) : '',
  ].filter(Boolean).join('');

  const waText = encodeURIComponent(`Hi, I'm interested in ${pid} (${d.bhk || ''}, ${d.location || ''})`);
  const waLink = `https://wa.me/${CUSTOMER_WA}?text=${waText}`;
  const galleryUrl = `${config.publicBaseUrl}/api/gallery/${encodeURIComponent(pid)}`;

  const heroChip = d.apartmentType || '';

  const similarHtml = similar.length > 0
    ? `<div class="related-strip">
        <h3>Similar places nearby</h3>
        <div class="related-row">${similar.map(renderSimilarCard).join('')}</div>
      </div>`
    : '';

  const videosSection = videos.length > 0
    ? `<div class="media-section">
        <h4 class="media-heading">Videos (${videos.length})</h4>
        <div class="video-grid">
          ${videos.map((v) => `<video src="${esc(v)}" controls preload="none" class="prop-video"></video>`).join('')}
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — EasyFind</title>
<meta property="og:title" content="${esc(title)} — EasyFind">
<meta property="og:description" content="${esc(rentFmt)}/mo · ${esc(d.location || '')}">
${cover ? `<meta property="og:image" content="${esc(cover)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#F5F2EA; --ink:#232620; --ink-soft:#5B5A50;
  --green:#14453D; --green-soft:#DCE6E1;
  --brick:#A85C3E; --line:#DED6C4; --card:#FFFDF8; --radius:18px;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--paper);color:var(--ink);font-family:'Inter',sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased;}
h1,h2,h3,h4,.serif{font-family:'Fraunces',serif;}
a{color:inherit;text-decoration:none;}

/* ── Hero ── */
.hero{position:relative;height:460px;overflow:hidden;background:#e8e4da;}
.hero img{width:100%;height:100%;object-fit:cover;display:block;}
.hero-chip{
  position:absolute;top:24px;left:24px;background:rgba(20,69,61,.9);color:#fff;
  padding:7px 16px;border-radius:100px;font-size:12.5px;font-weight:600;letter-spacing:.02em;
}
.hero-price{
  position:absolute;bottom:24px;left:24px;background:#fff;padding:14px 20px;
  border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);
}
.hero-price .p{font-family:'Fraunces',serif;font-size:28px;font-weight:600;color:var(--brick);}
.hero-price .sub{font-size:12px;color:var(--ink-soft);margin-top:3px;}

/* ── Layout ── */
.content-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:44px;padding:36px 40px 50px;max-width:1200px;margin:0 auto;}
.col-title{font-size:26px;font-weight:500;margin-bottom:6px;}
.col-sub{color:var(--ink-soft);font-size:14px;margin-bottom:24px;}

/* ── Thumbnails ── */
.thumb-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:28px;}
.thumb-row img{width:100%;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;}
.thumb-row img:hover{opacity:.85;}

/* ── Facts ── */
.facts-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 24px;margin-bottom:28px;}
.fact{border-bottom:1px solid var(--line);padding-bottom:10px;}
.fact .k{font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;}
.fact .v{font-size:14.5px;font-weight:600;}

/* ── Tags ── */
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px;}
.tag{background:var(--green-soft);color:var(--green);font-size:12.5px;font-weight:600;padding:6px 13px;border-radius:100px;}

/* ── Side card ── */
.side-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;position:sticky;top:24px;}
.side-card .p{font-family:'Fraunces',serif;font-size:28px;font-weight:600;color:var(--brick);margin-bottom:4px;}
.side-card .per{font-size:13px;color:var(--ink-soft);font-family:'Inter',sans-serif;font-weight:500;}
.side-card .society{font-size:13px;color:var(--ink-soft);margin-bottom:18px;}
.cta-primary,.cta-secondary{display:block;width:100%;text-align:center;padding:13px;border-radius:10px;font-weight:600;font-size:14px;border:none;cursor:pointer;font-family:'Inter',sans-serif;margin-bottom:10px;}
.cta-primary{background:var(--green);color:#fff;}
.cta-primary:hover{background:#1a5c51;}
.cta-secondary{background:transparent;color:var(--green);border:1.5px solid var(--green);}
.cta-secondary:hover{background:var(--green-soft);}
.side-note{font-size:11.5px;color:var(--ink-soft);text-align:center;margin-top:12px;}
.pid-line{font-size:11px;color:var(--ink-soft);text-align:center;margin-top:8px;font-family:monospace;}

/* ── Media section ── */
.media-section{margin-top:20px;}
.media-heading{font-size:15px;font-weight:600;margin-bottom:12px;color:var(--ink-soft);}
.video-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.prop-video{width:100%;border-radius:10px;background:#000;}

/* ── Similar ── */
.related-strip{padding:0 40px 60px;max-width:1200px;margin:0 auto;}
.related-strip h3{font-size:16px;font-weight:600;margin-bottom:16px;}
.related-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.r-card{border:1px solid var(--line);border-radius:12px;overflow:hidden;display:block;transition:box-shadow .15s;}
.r-card:hover{box-shadow:0 4px 20px rgba(20,69,61,.12);}
.r-card img,.r-card-no-img{width:100%;height:110px;object-fit:cover;display:block;background:#e8e4da;}
.rb{padding:10px 12px 14px;}
.rp{font-family:'Fraunces',serif;color:var(--brick);font-weight:600;font-size:15px;margin-bottom:2px;}
.rl{font-size:11.5px;color:var(--ink-soft);}

/* ── Share bar ── */
.share-bar{padding:16px 40px;border-top:1px solid var(--line);background:var(--card);display:flex;align-items:center;gap:12px;font-size:13px;color:var(--ink-soft);}
.share-url{flex:1;font-family:monospace;font-size:12px;word-break:break-all;}

@media(max-width:900px){
  .content-grid{grid-template-columns:1fr;padding:24px;}
  .side-card{position:static;}
  .related-row{grid-template-columns:1fr 1fr;}
  .hero{height:280px;}
  .facts-grid{grid-template-columns:repeat(2,1fr);}
  .thumb-row{grid-template-columns:repeat(4,1fr);}
  .related-strip{padding:0 24px 40px;}
}
@media(max-width:480px){
  .related-row{grid-template-columns:1fr;}
  .thumb-row{grid-template-columns:repeat(3,1fr);}
  .hero-price .p{font-size:22px;}
}
</style>
</head>
<body>

<!-- Hero -->
<div class="hero">
  ${cover ? `<img src="${esc(cover)}" alt="${esc(title)}">` : ''}
  ${heroChip ? `<div class="hero-chip">${esc(heroChip)}</div>` : ''}
  ${rentFmt ? `
  <div class="hero-price">
    <div class="p">${esc(rentFmt)}<span style="font-size:14px;color:var(--ink-soft);font-family:'Inter',sans-serif;">/mo</span></div>
    ${subLine ? `<div class="sub">${esc(subLine)}</div>` : ''}
  </div>` : ''}
</div>

<!-- Content -->
<div class="content-grid">
  <div>
    <h2 class="col-title">${esc(title)}</h2>
    <p class="col-sub">${esc(subtitle)}</p>

    ${thumbs ? `<div class="thumb-row">${thumbs}</div>` : ''}

    ${facts ? `<div class="facts-grid">${facts}</div>` : ''}

    ${tags ? `<div class="tags">${tags}</div>` : ''}

    ${videosSection}
  </div>

  <div>
    <div class="side-card">
      ${rentFmt ? `<div class="p">${esc(rentFmt)}<span class="per"> /mo</span></div>` : ''}
      ${d.societyName ? `<div class="society">${esc(d.societyName)}${d.location ? `, ${esc(d.location)}` : ''}</div>` : ''}
      <a href="${esc(waLink)}" class="cta-primary">Contact Now</a>
      <a href="${esc(waLink)}" class="cta-secondary">Chat on WhatsApp</a>
      <div class="side-note">A team member usually replies within a few hours</div>
      ${pid ? `<div class="pid-line">${esc(pid)}</div>` : ''}
    </div>
  </div>
</div>

${similarHtml}

<!-- Share bar -->
<div class="share-bar">
  <span>Share this listing:</span>
  <span class="share-url">${esc(galleryUrl)}</span>
</div>

</body>
</html>`;
}

module.exports = { renderGallery };
