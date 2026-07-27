// js/calibration.js

let homographyMatrix = null;
let inverseHomographyMatrix = null;

// Standard singles tennis court dimensions in meters
const COURT_WIDTH = 8.23;
const COURT_LENGTH = 23.77;

// Mapping of court corners (Top-Left, Top-Right, Bottom-Right, Bottom-Left) in meters
// Since the camera is behind a player at ~2m height, the near baseline might not be fully visible.
// We calibrate using the FAR baseline and the NET line to be more robust.
// Origin (0,0) is the top-left corner of the far baseline.
// Net is in the middle: y = 11.885
const NET_DISTANCE = COURT_LENGTH / 2;

const realCourtCorners = [
    { x: 0, y: 0 }, // Far Left (Baseline)
    { x: COURT_WIDTH, y: 0 }, // Far Right (Baseline)
    { x: COURT_WIDTH, y: NET_DISTANCE }, // Net Right
    { x: 0, y: NET_DISTANCE } // Net Left
];

function getPinCoordinates() {
    const tl = document.getElementById('pin-tl');
    const tr = document.getElementById('pin-tr');
    const bl = document.getElementById('pin-bl');
    const br = document.getElementById('pin-br');

    // Convert pin position relative to the document into video pixel coordinates
    const getPos = (pin) => {
        const rect = pin.getBoundingClientRect();
        const pinCenterX = rect.left + rect.width / 2;
        const pinCenterY = rect.top + rect.height / 2;

        const canvasRect = canvasOverlay.getBoundingClientRect();

        // Map to internal video resolution
        const scaleX = canvasOverlay.width / canvasRect.width;
        const scaleY = canvasOverlay.height / canvasRect.height;

        const x = (pinCenterX - canvasRect.left) * scaleX;
        const y = (pinCenterY - canvasRect.top) * scaleY;

        return { x, y };
    };

    return [
        getPos(tl),
        getPos(tr),
        getPos(br), // Order must match realCourtCorners: TL, TR, BR, BL
        getPos(bl)
    ];
}

function updateHomography() {
    if (!cvReady) return;

    try {
        const imagePoints = getPinCoordinates();

        let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
            imagePoints[0].x, imagePoints[0].y,
            imagePoints[1].x, imagePoints[1].y,
            imagePoints[2].x, imagePoints[2].y,
            imagePoints[3].x, imagePoints[3].y
        ]);

        let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
            realCourtCorners[0].x, realCourtCorners[0].y,
            realCourtCorners[1].x, realCourtCorners[1].y,
            realCourtCorners[2].x, realCourtCorners[2].y,
            realCourtCorners[3].x, realCourtCorners[3].y
        ]);

        // Find Homography mapping Image pixels to Real world meters
        if (homographyMatrix) homographyMatrix.delete();
        homographyMatrix = cv.findHomography(srcPts, dstPts);

        // Find Inverse Homography mapping Real world meters to Image pixels
        if (inverseHomographyMatrix) inverseHomographyMatrix.delete();
        inverseHomographyMatrix = cv.findHomography(dstPts, srcPts);

        srcPts.delete();
        dstPts.delete();

        console.log("Homography updated.");

        // Draw the court outline to give immediate visual feedback
        drawCourtOutline(imagePoints);

    } catch (e) {
         console.error("Error updating homography:", e);
    }
}

function drawCourtOutline(pts) {
    if (!ctxOverlay || !canvasOverlay) return;

    // Clear only if tracking isn't running yet, tracking will clear it on its own loop
    // But to be safe, we just draw over it.
    ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);

    ctxOverlay.beginPath();
    ctxOverlay.moveTo(pts[0].x, pts[0].y); // TL
    ctxOverlay.lineTo(pts[1].x, pts[1].y); // TR
    ctxOverlay.lineTo(pts[2].x, pts[2].y); // BR (Net Right)
    ctxOverlay.lineTo(pts[3].x, pts[3].y); // BL (Net Left)
    ctxOverlay.closePath();

    ctxOverlay.lineWidth = 3;
    ctxOverlay.strokeStyle = 'rgba(0, 150, 255, 0.8)'; // Blueish
    ctxOverlay.stroke();

    // Fill slightly
    ctxOverlay.fillStyle = 'rgba(0, 150, 255, 0.1)';
    ctxOverlay.fill();

    // Draw text labels
    ctxOverlay.font = "20px Arial";
    ctxOverlay.fillStyle = "white";
    ctxOverlay.fillText("Fondo Sx", pts[0].x, pts[0].y - 10);
    ctxOverlay.fillText("Fondo Dx", pts[1].x, pts[1].y - 10);
    ctxOverlay.fillText("Rete Dx", pts[2].x, pts[2].y + 20);
    ctxOverlay.fillText("Rete Sx", pts[3].x, pts[3].y + 20);
}

function autoCalibrate() {
    console.log("Attempting auto-calibration...");
    if (!cvReady || !video || video.readyState < 2) return;

    try {
        const cap = new cv.VideoCapture(video);
        let frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
        cap.read(frame);

        let gray = new cv.Mat();
        let edges = new cv.Mat();

        // Convert to grayscale
        cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY, 0);

        // Apply Gaussian Blur
        let ksize = new cv.Size(5, 5);
        cv.GaussianBlur(gray, gray, ksize, 0, 0, cv.BORDER_DEFAULT);

        // Canny edge detection
        cv.Canny(gray, edges, 50, 150, 3, false);

        // Hough Lines (probabilistic)
        let lines = new cv.Mat();
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

        // For a true auto-calibration, we would group these lines to find the main court rectangle.
        // Due to the complexity and variability of lighting/background in a simple web app,
        // we'll leave this as a fallback to the manual pins if a clear rectangle isn't found.

        let courtFound = false;
        // In a complete implementation, this would involve geometric analysis of 'lines'
        // to find the largest perspective rectangle that matches a tennis court ratio.
        // If found, update pin positions and call updateHomography().

        if (!courtFound) {
            console.log("Auto-calibration could not confidently find the court. Using default/manual pins.");
        }

        frame.delete();
        gray.delete();
        edges.delete();
        lines.delete();

        // Ensure homography is calculated with initial/current pin positions
        updateHomography();
    } catch(e) {
        console.error("Auto-calibration failed:", e);
        updateHomography();
    }
}

// Convert image pixel (x,y) to real world (x,y) in meters
function pixelToMeters(px, py) {
    if (!homographyMatrix || homographyMatrix.empty()) return null;

    let src = cv.matFromArray(1, 1, cv.CV_32FC2, [px, py]);
    let dst = new cv.Mat();

    cv.perspectiveTransform(src, dst, homographyMatrix);

    let result = {
        x: dst.data32F[0],
        y: dst.data32F[1]
    };

    src.delete();
    dst.delete();
    return result;
}

// Attach recalibrate button logic
document.addEventListener('DOMContentLoaded', () => {
    const recalibrateBtn = document.getElementById('recalibrate-btn');
    if (recalibrateBtn) {
        recalibrateBtn.addEventListener('click', () => {
            autoCalibrate();
        });
    }
});
