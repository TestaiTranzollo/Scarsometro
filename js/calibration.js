// js/calibration.js

let homographyMatrix = null;
let inverseHomographyMatrix = null;

// Standard singles tennis court dimensions in meters
const COURT_WIDTH = 8.23;
const COURT_LENGTH = 23.77;

// Mapping of court corners (Top-Left, Top-Right, Bottom-Right, Bottom-Left) in meters
// Origin (0,0) is at the top-left corner of the court.
const realCourtCorners = [
    { x: 0, y: 0 },
    { x: COURT_WIDTH, y: 0 },
    { x: COURT_WIDTH, y: COURT_LENGTH },
    { x: 0, y: COURT_LENGTH }
];

function getPinCoordinates() {
    const container = document.getElementById('video-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Get pin elements
    const tl = document.getElementById('pin-tl');
    const tr = document.getElementById('pin-tr');
    const bl = document.getElementById('pin-bl');
    const br = document.getElementById('pin-br');

    // Extract percentage positions and convert to pixels relative to the container
    const getPos = (pin) => {
        return {
            x: (parseFloat(pin.style.left) / 100) * width,
            y: (parseFloat(pin.style.top) / 100) * height
        };
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
    } catch (e) {
         console.error("Error updating homography:", e);
    }
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
