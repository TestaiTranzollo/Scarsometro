// js/tracking.js

let lastFrameTime = 0;
let ballTrajectory = []; // Stores recent ball positions {x, y, time}
let cap = null;
let frame = null;
let hsvFrame = null;
let mask = null;
let blurFrame = null;

function initTracker() {
    if (!cvReady || !video) return;

    cap = new cv.VideoCapture(video);
    frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    hsvFrame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3);
    mask = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);
    blurFrame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3);
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

            // Convert from RGBA to RGB, then to HSV
            cv.cvtColor(frame, blurFrame, cv.COLOR_RGBA2RGB, 0);

            // Apply slight blur to reduce noise before color filtering
            let ksize = new cv.Size(5, 5);
            cv.GaussianBlur(blurFrame, blurFrame, ksize, 0, 0, cv.BORDER_DEFAULT);

            cv.cvtColor(blurFrame, hsvFrame, cv.COLOR_RGB2HSV, 0);

            // Define range for Optic Yellow in HSV
            // OpenCV HSV ranges: H: 0-179, S: 0-255, V: 0-255
            // Tennis ball yellow is usually around H: 30-45, S: 100-255, V: 100-255
            let lowerYellow = new cv.Mat(hsvFrame.rows, hsvFrame.cols, hsvFrame.type(), [25, 50, 50, 0]);
            let upperYellow = new cv.Mat(hsvFrame.rows, hsvFrame.cols, hsvFrame.type(), [50, 255, 255, 0]);

            cv.inRange(hsvFrame, lowerYellow, upperYellow, mask);

            lowerYellow.delete();
            upperYellow.delete();

            // Morphological operations to remove small noise dots and fill holes
            let M = cv.Mat.ones(5, 5, cv.CV_8U);
            cv.erode(mask, mask, M);
            cv.dilate(mask, mask, M);
            M.delete();

            // Find contours
            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let bestBall = null;
            // Loosened constraints to catch blurred/moving balls
            let minRadius = 1;
            let maxRadius = 50;

            // Analyze contours to find the ball
            for (let i = 0; i < contours.size(); ++i) {
                let cnt = contours.get(i);

                // Area filter (very loose for blur)
                let area = cv.contourArea(cnt);
                if (area < 5 || area > 2000) {
                    cnt.delete();
                    continue;
                }

                // Get bounding circle
                let circle = cv.minEnclosingCircle(cnt);
                if (circle.radius >= minRadius && circle.radius <= maxRadius) {
                    // Pick the one with the highest area (most likely the ball if color matches)
                    if (!bestBall || area > bestBall.area) {
                        bestBall = {
                            x: circle.center.x,
                            y: circle.center.y,
                            radius: circle.radius,
                            area: area
                        };
                    }
                }
                cnt.delete();
            }

            contours.delete();
            hierarchy.delete();

            // Clear overlay, then redraw court if available
            ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
            if (typeof getPinCoordinates === 'function') {
                const pts = getPinCoordinates();
                if (typeof drawCourtOutline === 'function') drawCourtOutline(pts);
            }

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
