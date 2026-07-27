// js/main.js

let video, canvasOverlay, ctxOverlay;
let stream = null;
let cvReady = false;
let isSideView = window.location.pathname.includes('sideview');

// Maximum gallery images
const MAX_GALLERY_IMAGES = 60;
let galleryImages = [];

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initCamera();

    // Check if OpenCV is loaded
    if (typeof cv !== 'undefined') {
        onOpenCvReady();
    } else {
        document.getElementById('opencv-script').onload = onOpenCvReady;
    }
});

function initUI() {
    video = document.getElementById('camera-video');
    canvasOverlay = document.getElementById('canvas-overlay');
    ctxOverlay = canvasOverlay.getContext('2d');

    // Make pins draggable
    const pins = document.querySelectorAll('.calibration-pin');
    pins.forEach(pin => makeDraggable(pin));

    // Gallery modal logic
    const galleryBtn = document.getElementById('gallery-btn');
    const closeGalleryBtn = document.getElementById('close-gallery');
    const galleryModal = document.getElementById('gallery-modal');

    galleryBtn.addEventListener('click', () => {
        galleryModal.classList.add('open');
    });

    closeGalleryBtn.addEventListener('click', () => {
        galleryModal.classList.remove('open');
    });

    // Algorithm toggle
    const algoToggle = document.getElementById('algo-toggle');
    algoToggle.addEventListener('change', (e) => {
        console.log("Stima mode changed to:", e.target.checked ? "3D" : "2D");
        // State is saved in the checkbox itself
    });
}

async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: "environment", // Use rear camera
                frameRate: { ideal: 60, max: 120 }, // Try to get highest possible framerate
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);

            // Once video is playing and OpenCV is ready, start processing
            if (cvReady) {
                startVideoProcessing();
            }
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Errore nell'accesso alla fotocamera. Assicurati di aver concesso i permessi.");
    }
}

function resizeCanvas() {
    // Determine letterboxing dimensions since video is 'contain'
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = video.clientWidth / video.clientHeight;

    let displayWidth = video.clientWidth;
    let displayHeight = video.clientHeight;

    if (videoRatio > containerRatio) {
        displayHeight = displayWidth / videoRatio;
    } else {
        displayWidth = displayHeight * videoRatio;
    }

    // Match canvas size to actual video dimensions for accurate internal coordinates
    canvasOverlay.width = video.videoWidth;
    canvasOverlay.height = video.videoHeight;

    // Position and size canvas over the exactly rendered video area
    canvasOverlay.style.width = displayWidth + 'px';
    canvasOverlay.style.height = displayHeight + 'px';

    const topOffset = (video.clientHeight - displayHeight) / 2;
    const leftOffset = (video.clientWidth - displayWidth) / 2;
    canvasOverlay.style.top = topOffset + 'px';
    canvasOverlay.style.left = leftOffset + 'px';
}

function onOpenCvReady() {
    // OpenCV requires a short delay sometimes to initialize properly even after load
    cv['onRuntimeInitialized'] = () => {
        console.log("OpenCV.js is ready.");
        cvReady = true;
        if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA
            startVideoProcessing();
        }
    };

    // Fallback if onRuntimeInitialized doesn't fire (sometimes happens if script already loaded)
    setTimeout(() => {
        if (!cvReady && typeof cv !== 'undefined' && cv.Mat) {
             console.log("OpenCV.js is ready (fallback).");
             cvReady = true;
             if (video && video.readyState >= 2) {
                 startVideoProcessing();
             }
        }
    }, 1000);
}

// Draggable functionality for pins
function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    elmnt.onmousedown = dragMouseDown;
    elmnt.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
        e = e || window.event;
        if(e.touches.length > 0) {
             pos3 = e.touches[0].clientX;
             pos4 = e.touches[0].clientY;
        }
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementDragTouch;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        updatePosition();
    }

    function elementDragTouch(e) {
        e = e || window.event;
        e.preventDefault(); // Prevent scrolling while dragging in landscape
        if(e.touches.length > 0) {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            updatePosition();
        }
    }

    function updatePosition() {
        let container = document.getElementById('video-container');
        let newTop = elmnt.offsetTop - pos2;
        let newLeft = elmnt.offsetLeft - pos1;

        // Clamp to container bounds
        newTop = Math.max(0, Math.min(newTop, container.clientHeight));
        newLeft = Math.max(0, Math.min(newLeft, container.clientWidth));

        // In landscape, absolute pixels are often more reliable than percentages due to viewport changes
        // but percentages keep it responsive if the window resizes.
        // We will stick to percentage but based strictly on client dimensions.
        let topPct = (newTop / container.clientHeight) * 100;
        let leftPct = (newLeft / container.clientWidth) * 100;

        elmnt.style.top = topPct + "%";
        elmnt.style.left = leftPct + "%";

        // Trigger recalibration if needed when pins move
        if (typeof updateHomography === 'function') {
            updateHomography();
        }
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}

// Processing Loop Placeholder
let processingLoopId = null;

function startVideoProcessing() {
    if (processingLoopId) cancelAnimationFrame(processingLoopId);

    console.log("Starting video processing loop");

    // We will initialize the video capture and processing pipeline here in the next steps.

    // Attempt auto-calibration once on start
    setTimeout(() => {
        if (typeof autoCalibrate === 'function') {
            autoCalibrate();
        }
    }, 1000);

    processFrame();
}
