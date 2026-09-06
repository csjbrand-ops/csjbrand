/* =========================================================
   CSJ ADMIN PANEL LOGIC
   Requires firebase-config.js to be loaded first (sets
   window.auth, window.db).
   No Firebase Storage / Blaze plan needed anywhere — product,
   hero and about images are all just filenames/paths from
   your GitHub images/ folder (e.g. "images/csj-1.jpg"),
   stored as plain text fields in Firestore.
   ========================================================= */

const FALLBACK_IMG = "data:image/svg+xml;utf8," + encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' width='300' height='360'>
    <rect width='100%' height='100%' fill='#f1eadb'/>
    <text x='50%' y='50%' font-family='sans-serif' font-size='14' fill='#8f6220' text-anchor='middle'>No Image</text>
  </svg>`);

let allProducts = [];   // cached admin product list
let allOrders = [];     // cached admin order list (all statuses)

/* =========================================================
   ONE-TIME IMPORT — the 9 products already hardcoded in
   index.html, copied here EXACTLY (name/price/oldPrice/cat/
   tag/img/colors/desc unchanged) so the admin panel never
   has to invent or retype them. This only runs if the
   `products` collection is completely empty, and uses the
   same numeric IDs as stable Firestore document IDs — so
   re-running this (e.g. on every login) is a no-op once the
   import has happened once. It will NOT create duplicates.
   ========================================================= */
const INITIAL_PRODUCTS = [
  { id:1, name:"Wine & Sky Duo", cat:"Premium", tag:"New", img:"images/csj-1.jpg", price:1650, oldPrice:null,
    colors:[{name:"Wine Maroon", hex:"#5c2027"},{name:"Sky Lavender", hex:"#b9c3e8"},{name:"Espresso Brown", hex:"#5a3a26"}],
    desc:"Soft-touch wash & wear suiting box — wine maroon, sky lavender and espresso brown in one set. Full unstitched length, ready for your tailor." },
  { id:2, name:"Olive & Cream Set", cat:"Signature", tag:"Best Seller", img:"images/csj-2.jpg", price:1850, oldPrice:null,
    colors:[{name:"Olive Green", hex:"#5a5a34"},{name:"Cream", hex:"#ecdcae"},{name:"Midnight Black", hex:"#17171a"},{name:"Sage Mint", hex:"#a9c2a0"}],
    desc:"Premium boxed set finished in tissue and satin band. Olive green with woven border, soft cream, jet black and fresh sage mint." },
  { id:3, name:"Charcoal & Camel Duo", cat:"Premium", tag:"New", img:"images/csj-3.jpg", price:1850, oldPrice:null,
    colors:[{name:"Charcoal Grey", hex:"#4a4d52"},{name:"Camel Tan", hex:"#a9855c"}],
    desc:"Grace suiting finish in cool charcoal grey and warm camel tan. Smooth hand-feel, holds its shape through a long day." },
  { id:4, name:"Beige, Navy & Rust Trio", cat:"Signature", tag:"New", img:"images/csj-4.jpg", price:1650, oldPrice:null,
    colors:[{name:"Warm Beige", hex:"#d6c7a8"},{name:"Deep Navy", hex:"#1f2b4a"},{name:"Rust Brown", hex:"#a35a2e"}],
    desc:"Three of our most-ordered tones together — warm beige, deep navy and rust brown, all with the same soft, breathable finish." },
  { id:5, name:"Taupe & Sky Blue Duo", cat:"Premium", tag:null, img:"images/csj-5.jpg", price:1850, oldPrice:null,
    colors:[{name:"Warm Taupe", hex:"#b7a58c"},{name:"Sky Blue", hex:"#a9c4d6"}],
    desc:"Nerm-o-Nazuk exclusive fabric — soft warm taupe and cool sky blue, comfortable enough for all-day wear." },
  { id:6, name:"Wine & Sage Duo", cat:"Signature", tag:"Best Seller", img:"images/csj-6.jpg", price:1850, oldPrice:null,
    colors:[{name:"Deep Wine", hex:"#4a1f28"},{name:"Sage Grey", hex:"#a8ac9c"}],
    desc:"Deep wine and soft sage grey — a rich, versatile pairing that works for both everyday and formal wear." },
  { id:7, name:"Olive & Blush Duo", cat:"Premium", tag:"New", img:"images/csj-7.jpg", price:1850, oldPrice:null,
    colors:[{name:"Royal Olive", hex:"#4a4a2e"},{name:"Dusty Blush", hex:"#d6a8a0"}],
    desc:"Royal suiting finish in deep olive and dusty blush pink — a striking, modern colour pairing." },
  { id:8, name:"White, Navy & Taupe Trio", cat:"Value", tag:null, img:"images/csj-8.jpg", price:1650, oldPrice:null,
    colors:[{name:"Pure White", hex:"#f5f4ef"},{name:"Navy Charcoal", hex:"#3d3d47"},{name:"Warm Taupe", hex:"#a89a7e"}],
    desc:"Crisp white, deep navy-charcoal and warm taupe — everyday premium cloth with a proper finish, great value." },
  { id:9, name:"Mustard & Aubergine Duo", cat:"Value", tag:"New", img:"images/csj-9.jpg", price:1650, oldPrice:null,
    colors:[{name:"Mustard Gold", hex:"#c9821f"},{name:"Deep Aubergine", hex:"#3a1f2e"},{name:"Chocolate Brown", hex:"#4a2e1a"}],
    desc:"Bold mustard gold, deep aubergine and rich chocolate brown — a standout colourway for Jumma and festive wear." }
];

async function importInitialProductsIfNeeded(){
  try{
    const existing = await window.db.collection('products').limit(1).get();
    if(!existing.empty) return; // already imported (or admin has added their own) — do nothing
    const batch = window.db.batch();
    INITIAL_PRODUCTS.forEach((p, idx)=>{
      const ref = window.db.collection('products').doc(String(p.id)); // stable doc ID
      batch.set(ref, {
        name: p.name,
        price: p.price,
        oldPrice: p.oldPrice,
        cat: p.cat,
        tag: p.tag,
        img: p.img,
        colors: p.colors,
        desc: p.desc,
        displayOrder: idx + 1,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    toast('Your 9 existing products were imported into Firestore.');
  }catch(err){
    console.warn('Initial product import skipped/failed:', err.message);
  }
}

/* ---------------- Toast helper ---------------- */
function toast(msg, type='success'){
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(()=> el.remove(), 3500);
}

/* ---------------- Auth ---------------- */
function doLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if(!email || !password){ errEl.textContent = 'Please enter your email and password.'; errEl.style.display='block'; return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Signing in…';
  window.auth.signInWithEmailAndPassword(email, password)
    .catch(err=>{
      errEl.textContent = 'Login failed: ' + (err.message || 'Please check your email and password.');
      errEl.style.display = 'block';
    })
    .finally(()=>{ btn.disabled = false; btn.textContent = 'Sign In'; });
}

function doLogout(){
  window.auth.signOut();
}

window.auth && window.auth.onAuthStateChanged(async user=>{
  if(user){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('whoAmI').textContent = user.email;
    await importInitialProductsIfNeeded();
    loadProductsAdmin();
    loadOrdersAdmin();
    loadSiteSettings();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
  }
});

/* ---------------- Tabs ---------------- */
function switchTab(tab, btn){
  document.querySelectorAll('.sidebar button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-products').style.display = tab==='products' ? 'block' : 'none';
  document.getElementById('tab-orders').style.display = tab==='orders' ? 'block' : 'none';
  document.getElementById('tab-settings').style.display = tab==='settings' ? 'block' : 'none';
}

function switchOrderSubtab(sub, btn){
  document.querySelectorAll('.order-subtabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  ['pending','completed','rejected'].forEach(s=>{
    document.getElementById('ordersList-'+s).style.display = (s===sub) ? 'flex' : 'none';
  });
}

/* ---------------- Load & render products ---------------- */
async function loadProductsAdmin(){
  const grid = document.getElementById('productGridAdmin');
  try{
    const snap = await window.db.collection('products').orderBy('displayOrder','asc').get();
    allProducts = [];
    snap.forEach(doc=> allProducts.push({ id: doc.id, ...doc.data() }));
    renderProductGridAdmin();
  }catch(err){
    grid.innerHTML = `<p style="color:var(--maroon); font-size:13px;">Could not load products: ${err.message}</p>`;
  }
}

function colorsToText(colors){
  if(!colors) return '';
  if(Array.isArray(colors)){
    return colors.map(c => (typeof c==='object') ? `${c.name}:${c.hex}` : c).join(', ');
  }
  return String(colors);
}
function textToColors(text){
  return text.split(',').map(s=>s.trim()).filter(Boolean).map(pair=>{
    const [name, hex] = pair.split(':').map(x=>x && x.trim());
    return { name: name || pair, hex: hex || '#b7a58c' };
  });
}

function renderProductGridAdmin(){
  const grid = document.getElementById('productGridAdmin');
  if(allProducts.length===0){
    grid.innerHTML = `<p style="color:var(--ink-soft); font-size:13px;">No products yet. Click "+ Add Product" to create your first one.</p>`;
    return;
  }
  grid.innerHTML = allProducts.map(p=>`
    <div class="p-card">
      <span class="status-pill ${p.active ? 'on':'off'}">${p.active ? 'Active':'Hidden'}</span>
      <img src="${p.img || ''}" alt="${p.name||''}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="p-body">
        <div class="p-name">${p.name || 'Unnamed'}</div>
        <div class="p-meta">Rs. ${p.price||0} · ${p.cat||'-'} · Order ${p.displayOrder??'-'}</div>
        <div class="p-actions">
          <button onclick="openProductModal('${p.id}')">Edit</button>
          <button onclick="toggleActive('${p.id}', ${!p.active})">${p.active ? 'Hide':'Show'}</button>
          <button onclick="deleteProduct('${p.id}')" style="color:var(--maroon);">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

/* ---------------- Add / Edit product modal ---------------- */
function openProductModal(id){
  const overlay = document.getElementById('productModalOverlay');
  const p = id ? allProducts.find(x=>x.id===id) : null;

  document.getElementById('productModalTitle').textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('pId').value = p ? p.id : '';
  document.getElementById('pName').value = p ? (p.name||'') : '';
  document.getElementById('pPrice').value = p ? (p.price||'') : '';
  document.getElementById('pOldPrice').value = p ? (p.oldPrice||'') : '';
  document.getElementById('pCategory').value = p ? (p.cat||'Signature') : 'Signature';
  document.getElementById('pTag').value = p ? (p.tag||'') : '';
  document.getElementById('pDesc').value = p ? (p.desc||'') : '';
  document.getElementById('pColors').value = p ? colorsToText(p.colors) : '';
  document.getElementById('pOrder').value = p ? (p.displayOrder ?? allProducts.length+1) : (allProducts.length+1);
  document.getElementById('pActive').checked = p ? !!p.active : true;
  document.getElementById('pImgPath').value = p ? (p.img||'') : '';
  document.getElementById('pImgPreview').src = (p && p.img) ? p.img : FALLBACK_IMG;

  overlay.classList.add('open');
}
function closeProductModal(){
  document.getElementById('productModalOverlay').classList.remove('open');
}

async function saveProduct(){
  const btn = document.getElementById('saveProductBtn');
  const id = document.getElementById('pId').value;
  const name = document.getElementById('pName').value.trim();
  const price = Number(document.getElementById('pPrice').value);
  if(!name || !price){ toast('Please enter a product name and price.', 'error'); return; }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try{
    // Image is just a path/filename that already exists in your GitHub images/ folder
    // (e.g. "images/csj-1.jpg") — no file upload, no Firebase Storage, no Blaze plan needed.
    const img = document.getElementById('pImgPath').value.trim();

    const data = {
      name,
      price,
      oldPrice: Number(document.getElementById('pOldPrice').value) || null,
      cat: document.getElementById('pCategory').value,
      tag: document.getElementById('pTag').value || null,
      desc: document.getElementById('pDesc').value.trim(),
      colors: textToColors(document.getElementById('pColors').value),
      displayOrder: Number(document.getElementById('pOrder').value) || 0,
      active: document.getElementById('pActive').checked,
      img
    };

    if(id){
      await window.db.collection('products').doc(id).update(data);
      toast('Product updated successfully.');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await window.db.collection('products').add(data);
      toast('Product added successfully.');
    }
    closeProductModal();
    loadProductsAdmin();
  }catch(err){
    toast('Error saving product: ' + err.message, 'error');
  }finally{
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

async function toggleActive(id, newState){
  try{
    await window.db.collection('products').doc(id).update({ active: newState });
    toast(newState ? 'Product is now visible on the site.' : 'Product hidden from the site.');
    loadProductsAdmin();
  }catch(err){
    toast('Error updating product: ' + err.message, 'error');
  }
}

async function deleteProduct(id){
  if(!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
  try{
    await window.db.collection('products').doc(id).delete();
    toast('Product deleted successfully.');
    loadProductsAdmin();
  }catch(err){
    toast('Error deleting product: ' + err.message, 'error');
  }
}

/* =========================================================
   ORDERS
   ========================================================= */
async function loadOrdersAdmin(){
  try{
    // Ordered by createdAt only (no `where` + `orderBy` combo needed) so this
    // never requires a Firestore composite index — status buckets are split in JS.
    const snap = await window.db.collection('orders').orderBy('createdAt','desc').get();
    allOrders = [];
    snap.forEach(doc=> allOrders.push({ id: doc.id, ...doc.data() }));
    renderOrdersLists();
  }catch(err){
    ['pending','completed','rejected'].forEach(s=>{
      document.getElementById('ordersList-'+s).innerHTML = `<p style="color:var(--maroon); font-size:13px;">Could not load orders: ${err.message}</p>`;
    });
  }
}

function orderCardHtml(o){
  const itemsHtml = (o.items||[]).map(i=>`
    <div class="oc-item-row">
      <span>${i.productName || i.productId || 'Item'} ${i.color ? '· '+i.color : ''} ${i.size ? '· '+i.size : ''} × ${i.qty}</span>
      <span>Rs. ${(i.lineTotal ?? (i.price*i.qty)).toLocaleString()}</span>
    </div>`).join('');

  const actions = o.status === 'pending' ? `
    <div class="oc-actions">
      <button class="btn-complete" onclick="setOrderStatus('${o.id}','completed')">✅ Order Complete</button>
      <button class="btn-reject" onclick="setOrderStatus('${o.id}','rejected')">❌ Reject Order</button>
    </div>` : '';

  return `
    <div class="order-card">
      <div class="oc-head">
        <div>
          <div class="oc-id">${o.orderId || o.id} <span class="status-badge ${o.status}">${o.status}</span></div>
          <div class="oc-date">${o.orderDate || ''} ${o.orderTime || ''}</div>
        </div>
        <div class="oc-total">Rs. ${(o.total||0).toLocaleString()}</div>
      </div>
      <div class="oc-customer">
        <strong>${o.customerName || '-'}</strong> · ${o.phone || '-'}<br>
        ${o.address || ''}${o.city ? ', '+o.city : ''}
        ${o.notes ? `<br><em>Note: ${o.notes}</em>` : ''}
        ${o.paymentScreenshotProvided ? '<br>💳 Advance payment screenshot was sent on WhatsApp' : '<br>💵 Cash on Delivery'}
      </div>
      <div class="oc-items">${itemsHtml}</div>
      ${actions}
    </div>`;
}

function renderOrdersLists(){
  const pending = allOrders.filter(o=>o.status==='pending');
  const completed = allOrders.filter(o=>o.status==='completed');
  const rejected = allOrders.filter(o=>o.status==='rejected');

  document.getElementById('ordersList-pending').innerHTML = pending.length
    ? pending.map(orderCardHtml).join('')
    : `<p style="color:var(--ink-soft); font-size:13px;">No pending orders right now.</p>`;

  document.getElementById('ordersList-completed').innerHTML = completed.length
    ? completed.map(orderCardHtml).join('')
    : `<p style="color:var(--ink-soft); font-size:13px;">No completed orders yet.</p>`;

  document.getElementById('ordersList-rejected').innerHTML = rejected.length
    ? rejected.map(orderCardHtml).join('')
    : `<p style="color:var(--ink-soft); font-size:13px;">No rejected orders.</p>`;
}

async function setOrderStatus(id, newStatus){
  const label = newStatus === 'completed' ? 'mark this order as completed' : 'reject this order';
  if(!confirm(`Are you sure you want to ${label}?`)) return;
  try{
    await window.db.collection('orders').doc(id).update({
      status: newStatus,
      statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(newStatus === 'completed' ? 'Order marked as completed.' : 'Order rejected.');
    loadOrdersAdmin();
  }catch(err){
    toast('Error updating order: ' + err.message, 'error');
  }
}

/* ---------------- Site settings ---------------- */
async function loadSiteSettings(){
  try{
    const doc = await window.db.collection('siteSettings').doc('main').get();
    if(doc.exists){
      const s = doc.data();
      document.getElementById('setHeroHeading').value = s.heroHeading || '';
      document.getElementById('setHeroSubtitle').value = s.heroSubtitle || '';
      document.getElementById('setHeroImgPath').value = s.heroImage || '';
      document.getElementById('setHeroImgPreview').src = s.heroImage || FALLBACK_IMG;
      document.getElementById('setAboutText1').value = s.aboutText1 || '';
      document.getElementById('setAboutText2').value = s.aboutText2 || '';
      document.getElementById('setAboutImgPath').value = s.aboutImage || '';
      document.getElementById('setAboutImgPreview').src = s.aboutImage || FALLBACK_IMG;
      document.getElementById('setWhatsapp').value = s.whatsappNumber || '';
    }
  }catch(err){
    toast('Could not load site settings: ' + err.message, 'error');
  }
}

async function saveSiteSettings(){
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try{
    // Hero/About images are just paths/filenames from your GitHub images/ folder
    // (e.g. "images/csj-2.jpg") — no file upload, no Firebase Storage needed.
    const data = {
      heroHeading: document.getElementById('setHeroHeading').value.trim(),
      heroSubtitle: document.getElementById('setHeroSubtitle').value.trim(),
      heroImage: document.getElementById('setHeroImgPath').value.trim(),
      aboutText1: document.getElementById('setAboutText1').value.trim(),
      aboutText2: document.getElementById('setAboutText2').value.trim(),
      aboutImage: document.getElementById('setAboutImgPath').value.trim(),
      whatsappNumber: document.getElementById('setWhatsapp').value.trim()
    };
    await window.db.collection('siteSettings').doc('main').set(data, { merge:true });
    toast('Settings updated successfully.');
  }catch(err){
    toast('Error saving settings: ' + err.message, 'error');
  }finally{
    btn.disabled = false; btn.textContent = 'Save Settings';
  }
}
