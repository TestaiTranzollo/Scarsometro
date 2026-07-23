// js/tracking.js

let bgSubtractor = null;
let lastFrameTime = 0;
let ballTrajectory = []; // Stores recent ball positions {x, y, time}
let cap = null;
let frame = null;
let fgMask = null;
let gray = null;
let blurFrame = null;

function initTracker() {
    if (!cvReady || !video) return;

    // Initialize background subtractor (MOG2)
    // Adjust history and varThreshold based on testing
    bgSubtractor = new cv.BackgroundSubtractorMOG2(500, 16, true);

    cap = new cv.VideoCapture(video);
    frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    fgMask = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
    gray = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
    blurFrame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
}

function processFrame() {
    if (!cvReady || !video || video.readyState < 2) {
        processingLoopId = requestAnimationFrame(processFrame);
        return;
    }

    if (!cap) {
        initTracker();
    }

    const currentTime = performance.now();
    // Delta time in seconds
    const dt = (currentTime - lastFrameTime) / 1000;

    if (lastFrameTime > 0 && dt > 0) {
        try {
            cap.read(frame);

            // Convert to grayscale for faster processing
            cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY, 0);

            // Apply slight blur to reduce noise
            let ksize = new cv.Size(3, 3);
            cv.GaussianBlur(gray, blurFrame, ksize, 0, 0, cv.BORDER_DEFAULT);

            // Apply background subtraction
            bgSubtractor.apply(blurFrame, fgMask);

            // Remove shadow and noise (thresholding)
            cv.threshold(fgMask, fgMask, 200, 255, cv.THRESH_BINARY);

            // Morphological operations to remove small noise dots and fill holes
            let M = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.erode(fgMask, fgMask, M);
            cv.dilate(fgMask, fgMask, M);
            cv.dilate(fgMask, fgMask, M);
            M.delete();

            // Find contours
            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(fgMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let bestBall = null;
            let minRadius = 2;
            let maxRadius = 30; // Tennis ball shouldn't appear too large

            // Analyze contours to find the ball
            for (let i = 0; i < contours.size(); ++i) {
                let cnt = contours.get(i);

                // Area filter
                let area = cv.contourArea(cnt);
                if (area < 10 || area > 1000) {
                    cnt.delete();
                    continue;
                }

                // Get bounding circle
                let circle = cv.minEnclosingCircle(cnt);
                if (circle.radius >= minRadius && circle.radius <= maxRadius) {
                    // It's a candidate for a ball
                    // We could add more checks (e.g. aspect ratio, color filtering for yellow)
                    bestBall = {
                        x: circle.center.x,
                        y: circle.center.y,
                        radius: circle.radius,
                        area: area
                    };
                }
                cnt.delete();
            }

            contours.delete();
            hierarchy.delete();

            // Clear overlay
            ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);

            if (bestBall) {
                // Draw detected ball
                ctxOverlay.beginPath();
                ctxOverlay.arc(bestBall.x, bestBall.y, bestBall.radius, 0, 2 * Math.PI, false);
                ctxOverlay.lineWidth = 2;
                ctxOverlay.strokeStyle = 'lime';
                ctxOverlay.stroke();

                // Add to trajectory
                ballTrajectory.push({
                    x: bestBall.x,
                    y: bestBall.y,
                    radius: bestBall.radius,
                    time: currentTime
                });

                // Keep only recent trajectory (e.g., last 1.5 seconds)
                ballTrajectory = ballTrajectory.filter(p => currentTime - p.time < 1500);

                // Call speed calculation module (next step)
                if (typeof calculateSpeed === 'function') {
                    calculateSpeed(ballTrajectory, dt);
                }
            } else {
                // If no ball detected, check if we need to finalize a trajectory (speed peak)
                if (typeof finalizeTrajectory === 'function') {
                    finalizeTrajectory();
                }
            }

            // Optional: Draw trajectory line
            if (ballTrajectory.length > 1) {
                ctxOverlay.beginPath();
                ctxOverlay.moveTo(ballTrajectory[0].x, ballTrajectory[0].y);
                for (let i = 1; i < ballTrajectory.length; i++) {
                    ctxOverlay.lineTo(ballTrajectory[i].x, ballTrajectory[i].y);
                }
                ctxOverlay.lineWidth = 2;
                ctxOverlay.strokeStyle = 'yellow';
                ctxOverlay.stroke();
            }

        } catch (err) {
            console.error("Error processing frame:", err);
        }
    }

    lastFrameTime = currentTime;
    processingLoopId = requestAnimationFrame(processFrame);
}
