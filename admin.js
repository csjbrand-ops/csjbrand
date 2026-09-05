/* =========================================================
   CSJ ADMIN PANEL LOGIC
   Requires firebase-config.js to be loaded first (sets
   window.auth, window.db).
   No Firebase Storage / Blaze plan needed — product images
   are referenced by filename/path from your GitHub images/
   folder, e.g. "images/csj-1.jpg", and just stored as a text
   field on the Firestore product document.
   ========================================================= */

const FALLBACK_IMG = "data:image/svg+xml;utf8," + encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' width='300' height='360'>
    <rect width='100%' height='100%' fill='#f1eadb'/>
    <text x='50%' y='50%' font-family='sans-serif' font-size='14' fill='#8f6220' text-anchor='middle'>No Image</text>
  </svg>`);

let allProducts = [];       // cached admin product list

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

window.auth && window.auth.onAuthStateChanged(user=>{
  if(user){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('whoAmI').textContent = user.email;
    loadProductsAdmin();
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
  document.getElementById('tab-settings').style.display = tab==='settings' ? 'block' : 'none';
}

/* ---------------- Load & render products ---------------- */
async function loadProductsAdmin(){
  const grid = document.getElementById('productGridAdmin');
  try{
    const snap = await window.db.collection('products').orderBy('order','asc').get();
    allProducts = [];
    snap.forEach(doc=> allProducts.push({ id: doc.id, ...doc.data() }));
    renderProductGridAdmin();
  }catch(err){
    grid.innerHTML = `<p style="color:var(--maroon); font-size:13px;">Could not load products: ${err.message}</p>`;
  }
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
      <img src="${p.imageUrl || ''}" alt="${p.name||''}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="p-body">
        <div class="p-name">${p.name || 'Unnamed'}</div>
        <div class="p-meta">Rs. ${p.price||0} · ${p.category||'-'} · Order ${p.order??'-'}</div>
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
  document.getElementById('pCategory').value = p ? (p.category||'Signature') : 'Signature';
  document.getElementById('pTag').value = p ? (p.tag||'') : '';
  document.getElementById('pDesc').value = p ? (p.description||'') : '';
  document.getElementById('pColors').value = p ? (Array.isArray(p.colors) ? p.colors.map(c=>c.name||c).join(', ') : (p.colors||'')) : '';
  document.getElementById('pOrder').value = p ? (p.order ?? allProducts.length+1) : (allProducts.length+1);
  document.getElementById('pActive').checked = p ? !!p.active : true;
  document.getElementById('pImgPath').value = p ? (p.imageUrl||'') : '';
  document.getElementById('pImgPreview').src = (p && p.imageUrl) ? p.imageUrl : FALLBACK_IMG;

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
    const imageUrl = document.getElementById('pImgPath').value.trim();

    const data = {
      name,
      price,
      oldPrice: Number(document.getElementById('pOldPrice').value) || null,
      category: document.getElementById('pCategory').value,
      tag: document.getElementById('pTag').value || null,
      description: document.getElementById('pDesc').value.trim(),
      colors: document.getElementById('pColors').value.split(',').map(s=>s.trim()).filter(Boolean),
      order: Number(document.getElementById('pOrder').value) || 0,
      active: document.getElementById('pActive').checked,
      imageUrl
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
