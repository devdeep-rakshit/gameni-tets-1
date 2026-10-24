// --- Configuration ---
const CONFIG = {
    botToken: 'YOUR_TELEGRAM_BOT_TOKEN', // Replace with your bot token
    chatId: 'YOUR_TELEGRAM_CHAT_ID',     // Replace with your chat ID
    intervalMs: 1000,                    // 1 frame per second
    imageQuality: 0.8                    // JPEG compression quality (0.0 to 1.0)
};

// --- State Variables ---
let mediaStream = null;
let captureIntervalId = null;
let isUploading = false;
let rateLimitPauseUntil = 0;

// --- DOM Elements ---
const videoElement = document.getElementById('cameraFeed');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusLog = document.getElementById('statusLog');

// Use a hidden canvas to extract frames
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

// --- Helper Functions ---
function updateStatus(message) {
    const time = new Date().toLocaleTimeString();
    statusLog.textContent = '[' + time + '] ' + message;
    console.log('[' + time + '] ' + message);
}

// Promisify canvas.toBlob for clean async/await syntax
function getBlobFromCanvas() {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg', CONFIG.imageQuality);
    });
}

// --- Main Logic ---

async function startSession() {
    try {
        updateStatus('Requesting camera permissions...');
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, // Prefers back camera on mobile, defaults to webcam on desktop
            audio: false 
        });
        
        videoElement.srcObject = mediaStream;
        
        // Wait for video metadata to set canvas dimensions correctly
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
        };

        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        updateStatus('Camera active. Starting transmission loop...');
        
        // Start the capture loop
        captureIntervalId = setInterval(processFrame, CONFIG.intervalMs);

    } catch (err) {
        updateStatus('Error accessing camera: ' + err.message);
    }
}

function stopSession() {
    // 1. Clear the automated loop
    if (captureIntervalId) {
        clearInterval(captureIntervalId);
        captureIntervalId = null;
    }

    // 2. Stop all camera tracks to release hardware
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    videoElement.srcObject = null;
    isUploading = false;

    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    updateStatus('Session stopped. Camera hardware released.');
}

async function processFrame() {
    const now = Date.now();

    // 1. Check Rate Limiting Backoff
    if (now < rateLimitPauseUntil) {
        return; // Silently wait out the rate limit
    }

    // 2. Prevent Backlog
    if (isUploading) {
        return; // Skip this frame if previous upload is still in progress
    }

    isUploading = true;

    try {
        // Draw current video frame to canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert to Blob
        const imageBlob = await getBlobFromCanvas();
        if (!imageBlob) throw new Error("Failed to create image blob");

        // Prepare Telegram Payload
        const formData = new FormData();
        formData.append('chat_id', CONFIG.chatId);
        formData.append('photo', imageBlob, 'frame_' + now + '.jpg');

        // Send to Telegram
        const response = await fetch('https://api.telegram.org/bot' + CONFIG.botToken + '/sendPhoto', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            updateStatus('Frame uploaded successfully.');
        } else if (response.status === 429) {
            // Handle Telegram Rate Limiting (Too Many Requests)
            const retryAfterSec = result.parameters && result.parameters.retry_after ? result.parameters.retry_after : 5; 
            updateStatus('Rate limited by Telegram. Pausing for ' + retryAfterSec + ' seconds.');
            rateLimitPauseUntil = now + (retryAfterSec * 1000);
        } else {
            updateStatus('Upload failed: ' + result.description);
        }

    } catch (err) {
        updateStatus('Network/Upload Error: ' + err.message);
    } finally {
        isUploading = false;
    }
}

// --- Event Listeners ---
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);

// Clean up automatically if the user closes/refreshes the tab
window.addEventListener('beforeunload', stopSession);