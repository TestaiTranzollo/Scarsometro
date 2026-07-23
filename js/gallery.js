// js/gallery.js

function saveSnapshot(speedKmh) {
    if (!video || !canvasOverlay) return;

    // Create a temporary canvas to composite the video frame and the overlay
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = video.videoWidth;
    snapCanvas.height = video.videoHeight;
    const ctx = snapCanvas.getContext('2d');

    // Draw current video frame
    ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);

    // Draw the overlay (tracking lines/circles)
    ctx.drawImage(canvasOverlay, 0, 0, snapCanvas.width, snapCanvas.height);

    // Add speed text directly on the snapshot for good measure
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'right';
    ctx.fillText(`${speedKmh} km/h`, snapCanvas.width - 20, 60);

    // Get Data URL (JPEG for compression)
    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.8);

    // Add to gallery array
    const snapshotData = {
        id: Date.now(),
        image: dataUrl,
        speed: speedKmh,
        date: new Date().toLocaleTimeString()
    };

    galleryImages.unshift(snapshotData); // Add to beginning

    // Enforce max 60 limit
    if (galleryImages.length > MAX_GALLERY_IMAGES) {
        galleryImages.pop(); // Remove oldest
    }

    // Update UI
    renderGallery();
}

function renderGallery() {
    const grid = document.getElementById('gallery-grid');
    const countSpan = document.getElementById('gallery-count');

    if (!grid || !countSpan) return;

    // Update count
    countSpan.textContent = galleryImages.length;

    // Clear grid
    grid.innerHTML = '';

    // Render items
    galleryImages.forEach(item => {
        const div = document.createElement('div');
        div.className = 'gallery-item';

        const img = document.createElement('img');
        img.src = item.image;
        img.alt = `Speed snapshot ${item.speed} km/h`;

        const speedBadge = document.createElement('div');
        speedBadge.className = 'gallery-item-speed';
        speedBadge.textContent = `${item.speed} km/h`;

        div.appendChild(img);
        div.appendChild(speedBadge);

        // Optional: click to view full screen
        div.addEventListener('click', () => {
             const newTab = window.open();
             newTab.document.body.innerHTML = `<img src="${item.image}" style="max-width: 100%; max-height: 100vh; display: block; margin: 0 auto;">`;
             newTab.document.body.style.backgroundColor = 'black';
        });

        grid.appendChild(div);
    });
}
