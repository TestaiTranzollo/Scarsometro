// js/speed.js

let currentMaxSpeed = 0;
let lastSpeedCalcTime = 0;
let speedHistory = [];
const TENNIS_BALL_DIAMETER_METERS = 0.067; // 6.7 cm

function calculateSpeed(trajectory, dt) {
    if (trajectory.length < 2) return;

    const algoToggle = document.getElementById('algo-toggle');
    const is3DMode = algoToggle.checked;

    // Get the two most recent points
    const p1 = trajectory[trajectory.length - 2];
    const p2 = trajectory[trajectory.length - 1];

    // Calculate time difference in seconds between the two frames precisely
    const frameDt = (p2.time - p1.time) / 1000;

    if (frameDt <= 0) return;

    let speedKmh = 0;

    if (!is3DMode) {
        // --- Algorithm A: 2D Projection on Court Plane ---
        const realP1 = pixelToMeters(p1.x, p1.y);
        const realP2 = pixelToMeters(p2.x, p2.y);

        if (realP1 && realP2) {
            // Calculate distance in meters
            const dx = realP2.x - realP1.x;
            const dy = realP2.y - realP1.y;
            const distanceMeters = Math.sqrt(dx * dx + dy * dy);

            // Speed in m/s
            const speedMs = distanceMeters / frameDt;
            // Convert to km/h
            speedKmh = speedMs * 3.6;
        }
    } else {
        // --- Algorithm B: 3D Estimation based on Ball Size / Trajectory ---
        // This is a rough estimation assuming the radius change reflects depth change.
        // It requires the focal length for true accuracy, but we approximate using the homography scale.

        // 1. Calculate base 2D displacement in pixels
        const dxPx = p2.x - p1.x;
        const dyPx = p2.y - p1.y;
        const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

        // 2. Estimate meters per pixel at the ball's location using Homography
        const realPos = pixelToMeters(p2.x, p2.y);
        const realPosOffset = pixelToMeters(p2.x + 10, p2.y); // Sample 10 pixels away

        if (realPos && realPosOffset) {
            const metersPerPixelBase = Math.abs(realPosOffset.x - realPos.x) / 10;

            // 3. Try to use ball radius to infer height/depth
            // The further away (or higher), the smaller the radius.
            // In a real 3D tracking, we'd need a calibrated camera matrix.
            // Here we use a heuristic based on the expected pixel size vs actual pixel size.

            let estimatedDistanceMeters = distPx * metersPerPixelBase;

            // Apply a scaling factor based on radius change if the ball is moving in Z axis
            // (very rough approximation for web)
            if (p1.radius > 0 && p2.radius > 0) {
                 const radiusRatio = p1.radius / p2.radius;
                 // If radius gets smaller, it's moving away (Z distance increases)
                 // This is highly sensitive to noise in radius detection

                 // Combine 2D distance and estimated Z distance
                 // For now, to keep it stable, we just apply a multiplier that tries to account for trajectory arc
                 // Often 2D projection underestimates by 10-20% on lobs.
                 estimatedDistanceMeters *= 1.15; // Empirical correction for 3D arc
            }

            const speedMs = estimatedDistanceMeters / frameDt;
            speedKmh = speedMs * 3.6;
        }
    }

    // Filter out insane speeds (noise)
    if (speedKmh > 10 && speedKmh < 260) {
        speedHistory.push({ speed: speedKmh, time: p2.time });

        if (speedKmh > currentMaxSpeed) {
            currentMaxSpeed = speedKmh;
            updateSpeedUI(Math.round(currentMaxSpeed));
        }
    }
}

function updateSpeedUI(speed) {
    const speedEl = document.getElementById('current-speed');
    if (speedEl) {
        speedEl.textContent = speed;
    }
}

function finalizeTrajectory() {
    if (speedHistory.length > 3 && currentMaxSpeed > 20) {
        // We have a completed trajectory with a valid peak speed.
        console.log(`Trajectory finished. Peak speed: ${Math.round(currentMaxSpeed)} km/h`);

        // Trigger snapshot save
        if (typeof saveSnapshot === 'function') {
            // Save the frame where the peak happened (approximated by current frame)
            saveSnapshot(Math.round(currentMaxSpeed));
        }
    }

    // Reset for next hit
    speedHistory = [];
    currentMaxSpeed = 0;
    ballTrajectory = [];
}
